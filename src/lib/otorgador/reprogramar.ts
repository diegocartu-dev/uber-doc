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
// ── LO QUE FALTA (TODO — spec §4.6) ──────────────────────────────────────────
// La REPROGRAMACIÓN MASIVA (el caso de Nova: "el Dr. X no puede atender el
// martes") son dos fases sobre esta misma función:
//   · `dry_run: true` → plan: turnos afectados del profesional en el rango +
//     candidato por turno con la MISMA priorización de §4.4 (`priorizarOferta`
//     de src/lib/otorgador/oferta.ts — no se reimplementa el criterio).
//   · confirmación → por turno, esta función; los turnos sin candidato se
//     devuelven marcados "gestión manual" (la fila naranja del mock 05, que es
//     una feature: Nova entrega lo irresoluble con destino claro).
// Falta también el endpoint `POST /api/otorgador/reprogramar` que las exponga
// y la UI del otorgador que las dispare. El aviso al profesional que RECIBE
// turnos debería agruparse por profesional en la masiva (la plantilla
// `reprogramacion_medico` ya habla de "N turnos" por eso).

import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import { acuerdoSemanalDelMedico } from "@/lib/otorgador/oferta";
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
  | "acuerdo_completo" // R6: el que recibe ya completó su acuerdo semanal
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

  // R6 SERVER-SIDE, igual que en `asignarTurno`: acuerdo semanal completo → no
  // recibe más pacientes esa semana. Faltaba acá, y el agujero era grande: un
  // profesional con el acuerdo completo NO podía recibir un turno por
  // asignación pero SÍ podía recibir cinco por reprogramación — que es
  // exactamente el día en que llegan de a varios.
  const acuerdo = await acuerdoSemanalDelMedico(nuevo.medico_id);
  if (acuerdo.completo) {
    return {
      ok: false,
      codigo: "acuerdo_completo",
      error: `El profesional ya completó su acuerdo de esta semana (${acuerdo.asignados} de ${acuerdo.acuerdo}). Elegí otro horario.`,
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
