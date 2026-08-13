// src/lib/otorgador/reprogramar.ts
// Reprogramación de UN turno institucional (spec §4.6, fase de confirmación).
// SOLO instancia institucional.
//
// ── EL ORDEN NO ES CAPRICHOSO ────────────────────────────────────────────────
// 1. Se TOMA el turno nuevo (UPDATE atómico contra estado='disponible').
// 2. Recién ahí se marca el viejo como 'reprogramado'.
// 3. Se revoca el token viejo.
// 4. Se avisa con un token NUEVO.
//
// Primero tomar y después soltar: si se soltara primero y el turno nuevo se lo
// llevara otro operador en el medio, el paciente quedaría SIN NINGUNO — que es
// exactamente el desenlace que no se puede permitir. Al revés, el peor caso es
// que quede tomado un turno de más, visible y arreglable a mano.
//
// La revocación va ANTES del aviso para que no exista ni un segundo en el que
// los dos links funcionen a la vez: si en ese instante el paciente toca el
// mensaje viejo, tiene que ver "este enlace ya no está activo", no entrar a un
// turno que ya no es suyo.
//
// ── LA REPROGRAMACIÓN MASIVA (spec §4.6) — YA EXISTE ─────────────────────────
// El caso de Nova ("el Dr. X no puede atender el martes") son dos fases sobre
// esta misma función, expuestas por `POST /api/otorgador/reprogramar-masivo`:
//   · `dry_run: true` → el plan (`planReprogramacionMasiva`), con la MISMA
//     priorización de §4.4 — no se reimplementa el criterio de equidad.
//   · confirmación → por turno, esta función. Los turnos sin candidato dejan su
//     fila `gestion_manual` (`registrarGestionManual`): la fila naranja del
//     mock 05 es una feature, y ahora además queda auditada.
//   · cierre → `marcarDiaSinAtencionDelProfesional`, para que el día que el
//     profesional no atiende no le acredite horas en la bolsa.
//
// El aviso al profesional que RECIBE turnos se AGRUPA (la plantilla
// `reprogramacion_medico` habla de "N turnos" por eso): la ejecución pide
// `agruparAvisoMedico: true` y el caller manda UN mensaje al final con el
// total real, vía `avisarReprogramacionAgrupadaMedico`.

import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import { VENTANA_ASIGNACION_MIN } from "@/lib/otorgador/oferta";
import { revocarAccesosDe } from "@/lib/institucional/accesos";
import {
  avisarReprogramacionTurno,
  registrarAvisosEnAsignacion,
  type AvisosAsignacion,
} from "@/lib/institucional/avisos";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Turnos que TODAVÍA se pueden mover. Uno en curso o terminado, no. */
const REPROGRAMABLES = ["confirmado", "en_espera"];

export type ErrorReprogramacion =
  | "validacion"
  | "no_encontrado"
  | "no_reprogramable" // ya empezó, ya pasó, o el slot no tiene paciente
  | "conflicto_slot" // otro operador se llevó el horario nuevo, o el horario ya cerró
  | "interno";

export type ResultadoReprogramar =
  | {
      ok: true;
      turnoAnterior: { id: string; fecha: string; hora_inicio: string; medico_id: string };
      turnoNuevo: { id: string; fecha: string; hora_inicio: string; medico_id: string };
      asignacionId: string | null;
      avisos: AvisosAsignacion;
      /** Cuántos links del turno viejo se apagaron (0 es normal si no hubo). */
      accesosRevocados: number;
    }
  | { ok: false; codigo: ErrorReprogramacion; error: string };

/**
 * Marca el DÍA de un profesional que avisó que no puede atender: sus slots que
 * quedaron libres pasan de `disponible` a `cancelado_medico`.
 *
 * ── POR QUÉ ES PARTE DEL MOTOR Y NO UN DETALLE ───────────────────────────────
 * Sin esto, de los turnos del profesional del martes los que se movieron quedan
 * `reprogramado` y los que nadie tomó siguen `disponible` — y `disponible`
 * CUENTA como hora puesta a disposición. O sea que el martes entero le entraba
 * al número contractual que se le factura a la institución, el mismo día en que
 * el profesional dijo que no iba a atender. Por el camino viejo (cancelar la
 * agenda) ese día caía en `cancelado_medico` y descontaba.
 *
 * `cancelado_medico` y no `bloqueado_sin_cobro` porque la baja la decidió ÉL:
 * `bloqueado*` está reservado para cuando la agenda la da de baja la
 * INSTITUCIÓN, y por eso es neutro.
 *
 * Idempotente: solo toca lo que sigue en `disponible`. Los turnos ya movidos,
 * los que están con paciente y los ya cancelados no se tocan.
 */
export async function marcarDiaSinAtencionDelProfesional(params: {
  medicoId: string;
  fecha: string;
}): Promise<{ ok: boolean; marcados: number }> {
  if (!esInstitucional()) return { ok: false, marcados: 0 };
  const { medicoId, fecha } = params;
  if (!UUID_RE.test(medicoId) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, marcados: 0 };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("turnos")
    .update({ estado: "cancelado_medico" })
    .eq("medico_id", medicoId)
    .eq("fecha", fecha)
    .eq("estado", "disponible")
    .in("canal_origen", ["acordado", "ofrecido"])
    .select("id");
  if (error) {
    // No se revierte nada: los turnos ya se movieron y los pacientes ya fueron
    // avisados. Se grita para que alguien mire el día — el costo de no hacerlo
    // es que ese día le acredite horas a quien no atendió.
    console.error(
      "[reprogramar] NO se pudo marcar el día sin atención:",
      medicoId,
      fecha,
      error.message
    );
    return { ok: false, marcados: 0 };
  }
  return { ok: true, marcados: data?.length ?? 0 };
}

/**
 * Deja rastro de un turno que la reprogramación NO pudo resolver.
 *
 * ── POR QUÉ HACE FALTA ───────────────────────────────────────────────────────
 * La fila naranja de la propuesta ("Sin lugar esta semana — queda para gestión
 * manual del call center") y los ítems que el operador desmarca eran VISIBLES
 * pero no AUDITADOS: no disparaban ninguna llamada ni ninguna escritura. El
 * turno seguía en `confirmado` con el profesional que acaba de avisar que no va
 * a atender, indistinguible de cualquier otro turno sano — y cerrada la
 * pestaña, el único rastro de que ese paciente quedó colgado desaparecía.
 *
 * No cambia el estado del turno a propósito: sigue siendo un turno vivo con su
 * paciente, y quien lo resuelve es una persona llamando por teléfono. Lo que
 * cambia es que ahora QUEDA ESCRITO quién quedó colgado, cuándo y por qué.
 *
 * `accion='gestion_manual'` no mueve el reparto de equidad (delta 0).
 */
export async function registrarGestionManual(params: {
  turnoId: string;
  operadorId: string;
  via: "panel" | "api";
  motivo: "sin_lugar" | "excluido_por_operador";
  detalle?: string;
}): Promise<{ ok: boolean }> {
  if (!esInstitucional()) return { ok: false };
  const { turnoId, operadorId, via } = params;
  if (!UUID_RE.test(turnoId)) return { ok: false };

  const admin = createAdminClient();
  const { data: turno } = await admin
    .from("turnos")
    .select("id, fecha, hora_inicio, estado, paciente_id, medico_id")
    .eq("id", turnoId)
    .maybeSingle();
  if (!turno || !turno.paciente_id) {
    console.error("[reprogramar] gestión manual sobre un turno sin paciente:", turnoId);
    return { ok: false };
  }

  const { error } = await admin.from("asignaciones").insert({
    operador_id: operadorId,
    tipo: "turno",
    recurso_id: turnoId,
    paciente_id: turno.paciente_id,
    medico_id: turno.medico_id,
    accion: "gestion_manual",
    via,
    detalle: {
      motivo: params.motivo,
      nota: params.detalle ?? null,
      turno: {
        fecha: turno.fecha,
        hora: (turno.hora_inicio ?? "").slice(0, 5),
        estado: turno.estado,
      },
    },
  });
  if (error) {
    console.error("[reprogramar] NO se pudo registrar la gestión manual:", turnoId, error.message);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * ── POR QUÉ EL NOMBRE LARGO ──────────────────────────────────────────────────
 * El repo YA exporta `reprogramarTurno` desde `src/lib/cancelaciones.ts`, y es
 * otra cosa: la reprogramación del B2C, la que hace el PACIENTE, con crédito y
 * política de reembolso. Esta es la del operador institucional moviendo un
 * turno entre slots. No hay error de compilación porque son módulos distintos,
 * pero el autocompletado ofrecía las dos con el mismo nombre y semánticas
 * opuestas — y el B2C tiene la regla explícita de que el médico NO reprograma
 * turnos otorgados. Importar la equivocada desde una pantalla de médico o de
 * admin no lo detectaba el tipado: las dos reciben strings.
 */
export async function reprogramarTurnoInstitucional(params: {
  turnoAnteriorId: string;
  turnoNuevoId: string;
  operadorId: string;
  via: "panel" | "api";
  motivo?: string;
  /**
   * true = el aviso al profesional que RECIBE lo manda el caller, agrupado.
   * Lo usa el motor masivo: sin esto, la profesional que recibe tres pacientes
   * recibía tres mensajes diciendo "se agregó 1 turno".
   */
  agruparAvisoMedico?: boolean;
}): Promise<ResultadoReprogramar> {
  if (!esInstitucional()) {
    return { ok: false, codigo: "validacion", error: "No disponible." };
  }
  const { turnoAnteriorId, turnoNuevoId, operadorId, via } = params;
  if (!UUID_RE.test(turnoAnteriorId) || !UUID_RE.test(turnoNuevoId)) {
    return { ok: false, codigo: "validacion", error: "Turno inválido." };
  }
  if (turnoAnteriorId === turnoNuevoId) {
    return { ok: false, codigo: "validacion", error: "El turno nuevo no puede ser el mismo." };
  }

  const admin = createAdminClient();

  const { data: anterior, error: errAnterior } = await admin
    .from("turnos")
    .select("id, fecha, hora_inicio, estado, paciente_id, medico_id")
    .eq("id", turnoAnteriorId)
    .maybeSingle();
  if (errAnterior) {
    console.error("[reprogramar] Error leyendo el turno anterior:", errAnterior.message);
    return { ok: false, codigo: "interno", error: "No se pudo leer el turno." };
  }
  if (!anterior) return { ok: false, codigo: "no_encontrado", error: "Ese turno no existe." };
  if (!anterior.paciente_id) {
    return { ok: false, codigo: "no_reprogramable", error: "Ese turno no tiene paciente asignado." };
  }
  if (!REPROGRAMABLES.includes(anterior.estado)) {
    return {
      ok: false,
      codigo: "no_reprogramable",
      error: "Ese turno ya empezó o ya no está vigente: no se puede reprogramar.",
    };
  }

  const { data: nuevo, error: errNuevo } = await admin
    .from("turnos")
    .select("id, fecha, hora_inicio, medico_id, canal_origen, estado")
    .eq("id", turnoNuevoId)
    .maybeSingle();
  if (errNuevo) {
    console.error("[reprogramar] Error leyendo el turno nuevo:", errNuevo.message);
    return { ok: false, codigo: "interno", error: "No se pudo leer el horario nuevo." };
  }
  if (!nuevo) return { ok: false, codigo: "no_encontrado", error: "Ese horario no existe." };
  if (nuevo.canal_origen !== "acordado" && nuevo.canal_origen !== "ofrecido") {
    return {
      ok: false,
      codigo: "validacion",
      error: "Ese horario no pertenece a los motores de la institución.",
    };
  }

  // Mismo guard que la asignación: un profesional suspendido puede tener slots
  // 'disponible' remanentes y no debe recibir pacientes.
  const { data: medicoNuevo } = await admin
    .from("medicos")
    .select("id, nombre_completo, titulo, especialidad, estado_registro")
    .eq("id", nuevo.medico_id)
    .maybeSingle();
  if (!medicoNuevo || medicoNuevo.estado_registro !== "aprobado") {
    return { ok: false, codigo: "no_encontrado", error: "Ese profesional no está habilitado." };
  }

  // ── R6 ES FLEXIBLE (Diego, 13/08): el acuerdo completo NO frena acá ───────
  // Este guard existía por simetría con `asignarTurno` —y era correcto mientras
  // R6 bloqueaba—. Con R6 flexible se cae por el mismo motivo, y acá con más
  // razón: la reprogramación masiva ocurre el día que un profesional no puede
  // atender, y lo que hay que resolver es a dónde va SU paciente. Rebotarlo
  // porque el que recibe ya cumplió su piso lo manda a gestión manual del call
  // center con un horario publicado y libre enfrente.
  //
  // El reparto sigue prefiriendo a quien menos lleva: el plan de
  // `reprogramar-masivo` ordena por la prioridad de `armarOferta` y solo
  // recurre a los que ya cumplieron cuando no queda otra.

  // ── VENTANA DE ASIGNACIÓN (T-5), re-validada acá ─────────────────────────
  // `asignarTurno` ya lo hace con el comentario "la oferta ya lo filtró, pero
  // la pantalla pudo quedar abierta un rato". Acá el hueco entre el filtro y el
  // UPDATE es MUCHO más grande: en la masiva el plan se arma con `armarOferta`
  // (T-5 al momento del plan), el operador revisa una tabla de 4-8 filas, y
  // recién después la pantalla ejecuta los ítems de a UNO en serie, cada uno
  // con su ida y vuelta de WhatsApp o mail. Y el reparto prefiere el MISMO DÍA,
  // o sea los horarios más cercanos al ahora.
  //
  // El escenario: propuesta armada 16:50 con un slot de 17:00, el operador
  // confirma 16:58, el tercer ítem ejecuta 17:03 → el paciente recibía un
  // WhatsApp con un turno que ya había arrancado. El `.eq('estado','disponible')`
  // no dice nada sobre la hora.
  //
  // El turno VIEJO, en cambio, NO tiene que ser futuro y es a propósito:
  // `en_espera` ocurre a la hora del turno, y un `confirmado` que ya pasó —el
  // paciente no apareció y el cron todavía no lo resolvió— es justamente lo que
  // el call center quiere mover. Lo que importa es que el destino sea futuro.
  const horaNueva = (nuevo.hora_inicio ?? "").slice(0, 8);
  const inicioNuevoMs = new Date(
    `${nuevo.fecha}T${horaNueva.length === 5 ? horaNueva + ":00" : horaNueva}-03:00`
  ).getTime();
  if (
    Number.isNaN(inicioNuevoMs) ||
    inicioNuevoMs <= Date.now() + VENTANA_ASIGNACION_MIN * 60_000
  ) {
    return {
      ok: false,
      codigo: "conflicto_slot",
      error: "Ese horario ya cerró (menos de 5 minutos). Elegí otro.",
    };
  }

  // ── 1. TOMAR el turno nuevo (lock optimista, igual que asignarTurno) ──
  const { data: tomado, error: errTomar } = await admin
    .from("turnos")
    .update({
      estado: "confirmado",
      paciente_id: anterior.paciente_id,
      asignado_por: operadorId,
      asignado_via: via,
      asignada_at: new Date().toISOString(),
    })
    .eq("id", turnoNuevoId)
    .eq("estado", "disponible")
    .select("id")
    .maybeSingle();
  if (errTomar) {
    console.error("[reprogramar] Error tomando el horario nuevo:", errTomar.message);
    return { ok: false, codigo: "interno", error: "No se pudo reprogramar. Probá de nuevo." };
  }
  if (!tomado) {
    return { ok: false, codigo: "conflicto_slot", error: "Ese horario se acaba de ocupar. Elegí otro." };
  }

  // ── 2. SOLTAR el viejo ──
  // Queda 'reprogramado' CON su paciente_id: es un estado terminal (no aparece
  // en ninguna vista de turnos vivos) y conservar el paciente deja el rastro de
  // qué se movió y de quién era. Borrarlo ahorraría nada y perdería la historia.
  const { data: soltado, error: errSoltar } = await admin
    .from("turnos")
    .update({ estado: "reprogramado" })
    .eq("id", turnoAnteriorId)
    .eq("estado", anterior.estado)
    .select("id")
    .maybeSingle();
  if (errSoltar || !soltado) {
    // El turno nuevo YA está tomado: no se revierte nada. Se grita fuerte para
    // que alguien mire el par (queda un turno de más, no uno de menos).
    console.error(
      "[reprogramar] HORARIO NUEVO TOMADO pero el viejo NO se pudo marcar como reprogramado:",
      errSoltar?.message ?? "carrera perdida",
      turnoAnteriorId
    );
  }

  // ── 3. REVOCAR el link viejo — antes de mandar el nuevo ──
  const accesosRevocados = await revocarAccesosDe({
    turnoId: turnoAnteriorId,
    motivo: "reprogramacion",
  });

  // ── 4. Auditoría + avisos ──
  const { data: paciente } = await admin
    .from("pacientes")
    .select("id, nombre_completo, telefono, email")
    .eq("id", anterior.paciente_id)
    .maybeSingle();

  let asignacionId: string | null = null;
  const { data: asig, error: errAsig } = await admin
    .from("asignaciones")
    .insert({
      operador_id: operadorId,
      tipo: "turno",
      recurso_id: turnoNuevoId,
      paciente_id: anterior.paciente_id,
      medico_id: nuevo.medico_id,
      accion: "reprogramada",
      via,
      detalle: {
        de: {
          turno_id: turnoAnteriorId,
          fecha: anterior.fecha,
          hora: (anterior.hora_inicio ?? "").slice(0, 5),
          medico_id: anterior.medico_id,
        },
        a: {
          turno_id: turnoNuevoId,
          fecha: nuevo.fecha,
          hora: (nuevo.hora_inicio ?? "").slice(0, 5),
          medico_id: nuevo.medico_id,
        },
        motivo: params.motivo ?? null,
        accesos_revocados: accesosRevocados,
      },
    })
    .select("id")
    .single();
  if (errAsig) {
    console.error("[reprogramar] TURNO REPROGRAMADO pero auditoría NO registrada:", errAsig.message);
  } else {
    asignacionId = asig.id;
  }

  // ── 4b. La OTRA mitad del reparto: el que pierde el paciente ──────────────
  // La fila `reprogramada` de arriba registra a quien RECIBE (+1). Sin esta,
  // el profesional que no atendió a nadie conservaba sus asignaciones y bajaba
  // de prioridad en la fila de equidad, mientras al que se quedó con sus ocho
  // pacientes el contador no le movía nada — o sea que en la oferta siguiente
  // seguía primero y se le apilaba más trabajo. La equidad invertida justo el
  // día que más se la necesita.
  //
  // Va SIEMPRE, incluso cuando el que pierde y el que recibe son el mismo
  // profesional moviéndose de horario: ahí +1 y −1 se cancelan y el neto es 0,
  // que es lo correcto (sigue siendo un paciente, no dos).
  const { error: errBaja } = await admin.from("asignaciones").insert({
    operador_id: operadorId,
    tipo: "turno",
    recurso_id: turnoAnteriorId,
    paciente_id: anterior.paciente_id,
    medico_id: anterior.medico_id,
    accion: "cancelada",
    via,
    detalle: {
      por_reprogramacion: true,
      asignacion_par: asignacionId,
      a: { turno_id: turnoNuevoId, medico_id: nuevo.medico_id },
      motivo: params.motivo ?? null,
    },
  });
  if (errBaja) {
    console.error(
      "[reprogramar] TURNO REPROGRAMADO pero la BAJA del profesional anterior NO se registró:",
      errBaja.message,
      turnoAnteriorId
    );
  }

  const nombreMedico = `${(medicoNuevo.titulo ?? "").trim()} ${(medicoNuevo.nombre_completo ?? "").trim()}`.trim();
  let medicoAnterior: { id: string; nombre: string } | null = null;
  if (anterior.medico_id !== nuevo.medico_id) {
    const { data: previo } = await admin
      .from("medicos")
      .select("nombre_completo")
      .eq("id", anterior.medico_id)
      .maybeSingle();
    medicoAnterior = { id: anterior.medico_id, nombre: previo?.nombre_completo ?? "" };
  }

  const avisos = await avisarReprogramacionTurno({
    paciente: {
      id: anterior.paciente_id,
      nombre: paciente?.nombre_completo ?? "",
      celular: paciente?.telefono ?? null,
      email: paciente?.email ?? null,
    },
    medico: {
      id: nuevo.medico_id,
      nombre: nombreMedico,
      especialidad: medicoNuevo.especialidad ?? "",
    },
    operadorId,
    turnoNuevo: { id: turnoNuevoId, fecha: nuevo.fecha, hora_inicio: nuevo.hora_inicio ?? "" },
    turnoAnterior: { fecha: anterior.fecha, hora_inicio: anterior.hora_inicio ?? "" },
    medicoAnterior,
    agruparAvisoMedico: params.agruparAvisoMedico,
  });
  await registrarAvisosEnAsignacion(asignacionId, avisos);

  return {
    ok: true,
    turnoAnterior: {
      id: turnoAnteriorId,
      fecha: anterior.fecha,
      hora_inicio: (anterior.hora_inicio ?? "").slice(0, 5),
      medico_id: anterior.medico_id,
    },
    turnoNuevo: {
      id: turnoNuevoId,
      fecha: nuevo.fecha,
      hora_inicio: (nuevo.hora_inicio ?? "").slice(0, 5),
      medico_id: nuevo.medico_id,
    },
    asignacionId,
    avisos,
    accesosRevocados,
  };
}
