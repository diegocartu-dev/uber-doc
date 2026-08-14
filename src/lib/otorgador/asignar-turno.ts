// src/lib/otorgador/asignar-turno.ts
// Asignación de un TURNO por el otorgador (spec institucional §4.5).
//
// Saltea el circuito de pago entero del B2C (reserva → checkout → webhook MP →
// confirmado): acá el compromiso lo pone la institución. UN solo UPDATE
// atómico con lock optimista:
//
//   UPDATE turnos SET estado='confirmado', paciente_id=…, asignado_*
//   WHERE id=… AND estado='disponible';
//
// El WHERE estado='disponible' resuelve la carrera entre operadores: 0 filas
// afectadas → el otro ganó → error tipado `conflicto_slot` (el banner naranja
// "Ese horario se acaba de ocupar" del 04-spec §1.7). Nunca existe
// `reservado_pendiente`, `reservado_hasta`, `pago_id` ni `mp_*`.

import { createAdminClient } from "@/lib/supabase/admin";
import { buscarEncuentroActivo } from "@/lib/consultas/encuentro-activo";
import { VENTANA_ASIGNACION_MIN } from "@/lib/otorgador/oferta";
import {
  avisarAsignacionTurno,
  registrarAvisosEnAsignacion,
  type AvisosAsignacion,
} from "@/lib/institucional/avisos";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PacienteAsignacion {
  id: string; // pacientes.id
  user_id: string;
  nombre: string;
  celular: string | null;
  email: string | null;
  /** De qué reunión de demostración es. `null` = paciente del padrón real. */
  demoSesionId: string | null;
}

/**
 * El guard que de verdad manda: un paciente y un profesional tienen que ser del
 * MISMO mundo.
 *
 * La oferta ya los separa (ver `acotarAlMundo` en oferta.ts), pero eso es un
 * filtro de una pantalla y esta API tiene clientes que no pasan por ninguna
 * pantalla — un operador IA, Nova, un `curl`. Sin este chequeo, un `paciente_id`
 * real con un `turno_id` del participante de la reunión escribe la asignación
 * igual, y a partir de ahí no hay vuelta: el trigger de la 025 marca el
 * encuentro como demo para siempre, el papel sale con "SIN VALIDEZ LEGAL", y
 * "limpiar reunión" se lo lleva puesto.
 *
 * `null` = pueden. String = el motivo de por qué no.
 */
export function mundosIncompatibles(
  demoPaciente: string | null,
  demoMedico: string | null
): string | null {
  if (demoPaciente === demoMedico) return null;
  if (demoMedico) {
    return "Ese profesional es de una reunión de demostración: no puede atender a un paciente del padrón.";
  }
  return "Ese paciente es de una reunión de demostración: solo lo puede atender un profesional de esa misma reunión.";
}

export type ErrorAsignacion =
  | "validacion"
  | "no_encontrado"
  | "sin_canal" // ni celular ni mail: no hay cómo mandarle el acceso (04-spec §1.6.3)
  | "paciente_ocupado" // regla del Uber: ya está adentro de una atención
  | "conflicto_slot" // otro operador lo tomó (o la ventana T-5 se cerró)
  | "interno";

export type ResultadoAsignarTurno =
  | {
      ok: true;
      turno: { id: string; fecha: string; hora_inicio: string; canal: "acordado" | "ofrecido" };
      medico: { id: string; nombre: string; especialidad: string };
      paciente: PacienteAsignacion;
      asignacionId: string | null;
      /** Resultado de los avisos (spec §8): registrado también en asignaciones.detalle. */
      avisos: AvisosAsignacion;
    }
  | { ok: false; codigo: ErrorAsignacion; error: string };

/** Carga la fila del padrón y exige un canal de contacto. */
export async function cargarPacienteParaAsignar(
  pacienteId: string
): Promise<{ ok: true; paciente: PacienteAsignacion } | { ok: false; codigo: ErrorAsignacion; error: string }> {
  if (!UUID_RE.test(pacienteId)) {
    return { ok: false, codigo: "validacion", error: "Paciente inválido." };
  }
  const admin = createAdminClient();
  const { data: p, error } = await admin
    .from("pacientes")
    .select("id, user_id, nombre_completo, telefono, email, demo_sesion_id")
    .eq("id", pacienteId)
    .maybeSingle();
  if (error) {
    console.error("[asignar] Error leyendo paciente:", error.message);
    return { ok: false, codigo: "interno", error: "No se pudo leer el padrón." };
  }
  if (!p) return { ok: false, codigo: "no_encontrado", error: "El paciente no está en el padrón." };
  if (!p.telefono && !p.email) {
    // R20: sin canal no se puede confirmar — el dato se carga inline en la
    // pantalla y queda en el padrón.
    return {
      ok: false,
      codigo: "sin_canal",
      error: "Falta un celular o mail para enviarle el acceso.",
    };
  }
  return {
    ok: true,
    paciente: {
      id: p.id,
      user_id: p.user_id,
      nombre: p.nombre_completo ?? "",
      celular: p.telefono ?? null,
      email: p.email ?? null,
      demoSesionId: (p.demo_sesion_id as string | null) ?? null,
    },
  };
}

/**
 * Regla del Uber (una atención por vez) vía el helper CANÓNICO
 * `buscarEncuentroActivo` — jamás una lista de estados a mano (CLAUDE.md).
 * El guard de asignar-turno y el de asignar-ci usan el mismo (spec §4.5).
 */
export async function pacienteConEncuentroActivo(
  paciente: PacienteAsignacion
): Promise<{ ocupado: boolean; detalle?: string }> {
  const admin = createAdminClient();
  const encuentro = await buscarEncuentroActivo(admin, paciente.user_id, paciente.id);
  if (encuentro && encuentro.pagado) {
    return {
      ocupado: true,
      detalle: `Ya tiene una atención en curso con ${encuentro.medicoNombre}. Resolvela antes de asignarle otra.`,
    };
  }
  return { ocupado: false };
}

export async function asignarTurno(params: {
  pacienteId: string;
  turnoId: string;
  operadorId: string;
  via: "panel" | "api";
}): Promise<ResultadoAsignarTurno> {
  const { pacienteId, turnoId, operadorId, via } = params;
  if (!UUID_RE.test(turnoId)) {
    return { ok: false, codigo: "validacion", error: "Turno inválido." };
  }

  const pacienteRes = await cargarPacienteParaAsignar(pacienteId);
  if (!pacienteRes.ok) return pacienteRes;
  const paciente = pacienteRes.paciente;

  const guard = await pacienteConEncuentroActivo(paciente);
  if (guard.ocupado) {
    return { ok: false, codigo: "paciente_ocupado", error: guard.detalle ?? "El paciente ya está en una atención." };
  }

  const admin = createAdminClient();

  // Datos del slot ANTES del UPDATE (ventana T-5 + info para la respuesta).
  const { data: turno, error: errTurno } = await admin
    .from("turnos")
    .select("id, medico_id, fecha, hora_inicio, canal_origen, estado")
    .eq("id", turnoId)
    .maybeSingle();
  if (errTurno) {
    console.error("[asignar-turno] Error leyendo turno:", errTurno.message);
    return { ok: false, codigo: "interno", error: "No se pudo leer el turno." };
  }
  if (!turno) return { ok: false, codigo: "no_encontrado", error: "Ese turno no existe." };

  // El canal del slot se RE-VALIDA server-side (hallazgo revisión Etapa 2): la
  // instancia no debería tener slots de otros canales (CHECK de la migración
  // 003), pero un cast silencioso asumía el invariante en vez de verificarlo —
  // y esta API tiene clientes que no pasan por la pantalla.
  if (turno.canal_origen !== "acordado" && turno.canal_origen !== "ofrecido") {
    return { ok: false, codigo: "validacion", error: "Ese turno no pertenece a los motores de la institución." };
  }

  // El dueño del slot se re-verifica ANTES de tomar el turno (hallazgo revisión
  // Etapa 2): un médico suspendido con slots 'disponible' remanentes seguía
  // asignable por API — asignar-ci ya exigía 'aprobado', acá faltaba.
  const { data: medico, error: errMedico } = await admin
    .from("medicos")
    .select("id, nombre_completo, titulo, especialidad, estado_registro, demo_sesion_id")
    .eq("id", turno.medico_id)
    .maybeSingle();
  if (errMedico) {
    console.error("[asignar-turno] Error leyendo médico:", errMedico.message);
    return { ok: false, codigo: "interno", error: "No se pudo verificar al profesional." };
  }
  if (!medico || medico.estado_registro !== "aprobado") {
    return { ok: false, codigo: "no_encontrado", error: "Ese profesional no está habilitado." };
  }

  // Los dos mundos no se cruzan. Ver `mundosIncompatibles`.
  const cruce = mundosIncompatibles(
    paciente.demoSesionId,
    (medico.demo_sesion_id as string | null) ?? null
  );
  if (cruce) return { ok: false, codigo: "validacion", error: cruce };

  // ── R6 ES FLEXIBLE: EL SLOT LIBRE MANDA (Diego, 13/08) ────────────────────
  // Acá vivía un guard duro: acuerdo semanal completo → 409 `acuerdo_completo`.
  // Ya no. "Mientras el profesional tenga un turno publicado, ese turno se
  // puede tomar": el acuerdo es el PISO de servicio comprometido, no un techo,
  // y el que publicó el lugar fue el propio profesional. Bloquear era decirle
  // que no a una hora que él mismo puso a disposición, y dejar al paciente sin
  // turno con la agenda vacía enfrente.
  //
  // La equidad no se pierde: se resuelve en el ORDEN de la oferta (menos
  // asignados primero; el acuerdo completo, último — `priorizarOferta`), que es
  // el criterio que ven por igual la pantalla, un operador IA y Nova.
  //
  // Lo que SIGUE mandando es el estado del slot: el `.eq('estado','disponible')`
  // del UPDATE de abajo y la ventana T-5. Nada de eso se relajó.

  // Ventana de asignación (Diego 12/08): hasta 5 minutos antes del horario.
  // La oferta ya lo filtró, pero la pantalla pudo quedar abierta un rato: el
  // server re-valida. Mismo desenlace que el conflicto (elegir otro horario).
  const hora = (turno.hora_inicio ?? "").slice(0, 8);
  const inicioMs = new Date(
    `${turno.fecha}T${hora.length === 5 ? hora + ":00" : hora}-03:00`
  ).getTime();
  if (Number.isNaN(inicioMs) || inicioMs <= Date.now() + VENTANA_ASIGNACION_MIN * 60_000) {
    return { ok: false, codigo: "conflicto_slot", error: "Ese horario ya cerró (menos de 5 minutos). Elegí otro." };
  }

  // EL UPDATE ATÓMICO — el lock optimista de la spec §4.5, tal cual.
  const { data: tomado, error: errUpdate } = await admin
    .from("turnos")
    .update({
      estado: "confirmado",
      paciente_id: paciente.id, // turnos.paciente_id = pacientes.id (asimetría §3)
      asignado_por: operadorId,
      asignado_via: via,
      asignada_at: new Date().toISOString(),
    })
    .eq("id", turnoId)
    .eq("estado", "disponible")
    .select("id")
    .maybeSingle();
  if (errUpdate) {
    console.error("[asignar-turno] Error en el UPDATE:", errUpdate.message);
    return { ok: false, codigo: "interno", error: "No se pudo asignar. Probá de nuevo." };
  }
  if (!tomado) {
    // Perdió la carrera contra otro operador: 0 filas afectadas.
    return { ok: false, codigo: "conflicto_slot", error: "Ese horario se acaba de ocupar. Elegí otro." };
  }

  // El médico ya se leyó (y verificó) antes del UPDATE.
  const nombreMedico = `${(medico.titulo ?? "").trim()} ${(medico.nombre_completo ?? "").trim()}`.trim();

  // Auditoría append-only (insumo del "X de Y"). Si falla, la asignación YA
  // ocurrió: se loguea fuerte, no se revierte (regla anti fallas silenciosas:
  // el fallo queda visible en logs, y el turno es consultable).
  let asignacionId: string | null = null;
  const { data: asig, error: errAsig } = await admin
    .from("asignaciones")
    .insert({
      operador_id: operadorId,
      tipo: "turno",
      recurso_id: turnoId,
      paciente_id: paciente.id,
      medico_id: turno.medico_id,
      accion: "asignada",
      via,
      detalle: { fecha: turno.fecha, hora: (turno.hora_inicio ?? "").slice(0, 5) },
    })
    .select("id")
    .single();
  if (errAsig) {
    console.error("[asignar-turno] TURNO ASIGNADO pero auditoría NO registrada:", errAsig.message, turnoId);
  } else {
    asignacionId = asig.id;
  }

  // ── Avisos (spec §8): link-sesión + WhatsApp con fallback a mail. La
  // asignación YA está hecha: un aviso fallido no la revierte — el resultado
  // queda en asignaciones.detalle (anti fallas silenciosas) y viaja en la
  // respuesta para el éxito de la pantalla.
  const avisos = await avisarAsignacionTurno({
    paciente: {
      id: paciente.id,
      nombre: paciente.nombre,
      celular: paciente.celular,
      email: paciente.email,
    },
    medico: { id: turno.medico_id, nombre: nombreMedico, especialidad: medico?.especialidad ?? "" },
    operadorId,
    turno: { id: turnoId, fecha: turno.fecha, hora_inicio: turno.hora_inicio ?? "" },
  });
  await registrarAvisosEnAsignacion(asignacionId, avisos);

  return {
    ok: true,
    turno: {
      id: turnoId,
      fecha: turno.fecha,
      hora_inicio: (turno.hora_inicio ?? "").slice(0, 5),
      canal: turno.canal_origen as "acordado" | "ofrecido",
    },
    medico: {
      id: turno.medico_id,
      nombre: nombreMedico,
      especialidad: medico?.especialidad ?? "",
    },
    paciente,
    asignacionId,
    avisos,
  };
}
