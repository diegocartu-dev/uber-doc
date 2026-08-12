// src/lib/otorgador/asignar-ci.ts
// Asignación de una CONSULTA INMEDIATA por el otorgador (spec institucional
// §4.5).
//
// ── LA CI INSTITUCIONAL NACE EN ESTADO 'pagada' ──────────────────────────────
// Decisión tomada (spec §4.5, recomendación aprobada junto con la spec): es lo
// ÚNICO compatible con la regla de clonado del canal clínico. Con 'pagada':
//   · es conectable YA (whitelist del token CI = ["en_curso","pagada"]);
//   · las alertas "paciente listo" del médico disparan sobre CI 'pagada'
//     (sprint 07/06) sin tocar una línea;
//   · estadoPagoConsulta('pagada', null) → 'confirmado' → buscarEncuentroActivo
//     la clasifica como encuentro con compromiso — semántica correcta: acá el
//     compromiso lo pone la INSTITUCIÓN, no un pago.
// La alternativa (estado nuevo 'asignada') obligaba a tocar whitelist del
// token + alertas + encuentro-activo — contra la regla de clonado.
// Desaparecen 'esperando'/'aceptada': el médico ya opt-in-eó al ponerse activo.

import { createAdminClient } from "@/lib/supabase/admin";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { dentroVentanaCI, etiquetaVentana, acuerdoSemanalDelMedico } from "@/lib/otorgador/oferta";
import {
  avisarAsignacionCI,
  registrarAvisosEnAsignacion,
  type AvisosAsignacion,
} from "@/lib/institucional/avisos";
import {
  cargarPacienteParaAsignar,
  pacienteConEncuentroActivo,
  type ErrorAsignacion,
  type PacienteAsignacion,
} from "@/lib/otorgador/asignar-turno";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ErrorAsignacionCI =
  | ErrorAsignacion
  | "fuera_de_ventana" // la ventana horaria de CI del config está cerrada
  | "medico_no_disponible"; // apagó el toggle o está atendiendo

export type ResultadoAsignarCI =
  | {
      ok: true;
      consultaId: string;
      medico: { id: string; nombre: string; especialidad: string };
      paciente: PacienteAsignacion;
      asignacionId: string | null;
      /** Resultado de los avisos (spec §8): registrado también en asignaciones.detalle. */
      avisos: AvisosAsignacion;
    }
  | { ok: false; codigo: ErrorAsignacionCI; error: string };

export async function asignarCI(params: {
  pacienteId: string;
  medicoId: string;
  /** Opcional del operador (pendiente #11 de la spec — sin cierre formal aún). */
  motivo?: string;
  operadorId: string;
  via: "panel" | "api";
}): Promise<ResultadoAsignarCI> {
  const { pacienteId, medicoId, operadorId, via } = params;
  if (!UUID_RE.test(medicoId)) {
    return { ok: false, codigo: "validacion", error: "Profesional inválido." };
  }

  // Ventana horaria del config, validada SERVER-SIDE (spec §4.5): la CI solo
  // existe dentro del horario que habilita la institución.
  const config = await getConfigInstitucion();
  if (!dentroVentanaCI(config)) {
    return {
      ok: false,
      codigo: "fuera_de_ventana",
      error: `La consulta inmediata funciona de ${etiquetaVentana(config)}. Fuera de ese horario, asigná un turno.`,
    };
  }

  const pacienteRes = await cargarPacienteParaAsignar(pacienteId);
  if (!pacienteRes.ok) return pacienteRes;
  const paciente = pacienteRes.paciente;

  // Regla del Uber — mismo helper canónico que asignar-turno (spec §4.5).
  const guard = await pacienteConEncuentroActivo(paciente);
  if (guard.ocupado) {
    return { ok: false, codigo: "paciente_ocupado", error: guard.detalle ?? "El paciente ya está en una atención." };
  }

  const admin = createAdminClient();

  // Guards del médico: disponible (toggle prendido) y SIN encuentro en curso.
  const { data: medico, error: errMedico } = await admin
    .from("medicos")
    .select("id, nombre_completo, titulo, especialidad, disponible, estado_registro")
    .eq("id", medicoId)
    .maybeSingle();
  if (errMedico) {
    console.error("[asignar-ci] Error leyendo médico:", errMedico.message);
    return { ok: false, codigo: "interno", error: "No se pudo verificar al profesional." };
  }
  if (!medico || medico.estado_registro !== "aprobado") {
    return { ok: false, codigo: "no_encontrado", error: "Ese profesional no está habilitado." };
  }
  if (!medico.disponible) {
    return {
      ok: false,
      codigo: "medico_no_disponible",
      error: "El profesional ya no está con la consulta inmediata activa. Refrescá la oferta.",
    };
  }

  // Pertenencia al piloto, re-validada server-side (hallazgo revisión Etapa 2):
  // la oferta ya filtra por config.especialidades, pero esta API tiene clientes
  // que no pasan por la pantalla (operador IA con un medico_id cacheado o
  // alucinado) — el invariante se verifica acá, no se asume.
  if (!config.especialidades.includes(medico.especialidad ?? "")) {
    return {
      ok: false,
      codigo: "validacion",
      error: "Ese profesional no pertenece a las especialidades del piloto de la institución.",
    };
  }

  // R6 SERVER-SIDE (06-reglas-operativas): mismo guard que asignar-turno — la
  // pantalla pinta `seleccionable:false`, pero la equidad vale también por API.
  const acuerdo = await acuerdoSemanalDelMedico(medicoId);
  if (acuerdo.completo) {
    return {
      ok: false,
      codigo: "acuerdo_completo",
      error: `El profesional ya completó su acuerdo de esta semana (${acuerdo.asignados} de ${acuerdo.acuerdo}). Elegí otro.`,
    };
  }

  // Ocupación del médico: 'en_curso' (atendiendo) Y TAMBIÉN una CI 'pagada' ya
  // asignada esperando que abra la sala (hallazgo revisión Etapa 2: mirando
  // solo 'en_curso' se le podían apilar dos pacientes "para ahora", cada uno
  // con su reloj de 30 min corriendo). El backstop atómico contra la carrera
  // entre dos operadores es el índice único parcial de la migración 010 —
  // el 23505 del INSERT de abajo se traduce a estos mismos errores tipados.
  const [{ data: ciActiva }, { data: turnoEnCurso }] = await Promise.all([
    admin
      .from("consultas")
      .select("id, estado")
      .eq("medico_id", medicoId)
      .in("estado", ["pagada", "en_curso"])
      .limit(1),
    admin.from("turnos").select("id").eq("medico_id", medicoId).eq("estado", "en_curso").limit(1),
  ]);
  if ((ciActiva?.length ?? 0) > 0 || (turnoEnCurso?.length ?? 0) > 0) {
    const pendiente = ciActiva?.[0]?.estado === "pagada";
    return {
      ok: false,
      codigo: "medico_no_disponible",
      error: pendiente
        ? "El profesional ya tiene una consulta inmediata asignada esperando. Probá con otro o asigná un turno."
        : "El profesional está atendiendo a otro paciente en este momento. Probá con otro o asigná un turno.",
    };
  }

  // INSERT de la CI — nace 'pagada' (ver el bloque de decisión de arriba).
  // ⚠ Doble vínculo (asimetría §3): consultas.paciente_id = auth.users.id.
  const motivo = (params.motivo ?? "").trim() || "Asignada por la institución";
  const { data: consulta, error: errInsert } = await admin
    .from("consultas")
    .insert({
      paciente_id: paciente.user_id,
      medico_id: medicoId,
      especialidad: medico.especialidad ?? "",
      estado: "pagada",
      motivo_consulta: motivo,
      canal_origen: "espontaneo", // CHECK institucional: la CI es siempre el motor espontáneo
      asignado_por: operadorId,
      asignado_via: via,
      asignada_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (errInsert || !consulta) {
    // 23505 = índices únicos parciales de la migración 010: la carrera que el
    // check-then-INSERT no puede cerrar la cierra la DB. Se traduce al mismo
    // error tipado que el guard de arriba.
    if (errInsert?.code === "23505") {
      if ((errInsert.message ?? "").includes("idx_consultas_ci_activa_por_paciente")) {
        return { ok: false, codigo: "paciente_ocupado", error: "El paciente ya está en una atención. Refrescá y verificá." };
      }
      return {
        ok: false,
        codigo: "medico_no_disponible",
        error: "El profesional acaba de recibir otra consulta. Refrescá la oferta y probá con otro.",
      };
    }
    console.error("[asignar-ci] insert falló:", errInsert?.message);
    return { ok: false, codigo: "interno", error: "No se pudo asignar la consulta. Probá de nuevo." };
  }

  const nombreMedico = `${(medico.titulo ?? "").trim()} ${(medico.nombre_completo ?? "").trim()}`.trim();

  let asignacionId: string | null = null;
  const { data: asig, error: errAsig } = await admin
    .from("asignaciones")
    .insert({
      operador_id: operadorId,
      tipo: "ci",
      recurso_id: consulta.id,
      paciente_id: paciente.id,
      medico_id: medicoId,
      accion: "asignada",
      via,
      detalle: { motivo },
    })
    .select("id")
    .single();
  if (errAsig) {
    console.error("[asignar-ci] CI ASIGNADA pero auditoría NO registrada:", errAsig.message, consulta.id);
  } else {
    asignacionId = asig.id;
  }

  // ── Avisos (spec §8): "podés entrar ahora" al paciente + paciente-esperando
  // al profesional. La CI ya está asignada: un aviso fallido no la revierte —
  // el resultado queda en asignaciones.detalle y viaja en la respuesta.
  const avisos = await avisarAsignacionCI({
    paciente: {
      id: paciente.id,
      nombre: paciente.nombre,
      celular: paciente.celular,
      email: paciente.email,
    },
    medico: { id: medicoId, nombre: nombreMedico, especialidad: medico.especialidad ?? "" },
    operadorId,
    consultaId: consulta.id,
  });
  await registrarAvisosEnAsignacion(asignacionId, avisos);

  return {
    ok: true,
    consultaId: consulta.id,
    medico: { id: medicoId, nombre: nombreMedico, especialidad: medico.especialidad ?? "" },
    paciente,
    asignacionId,
    avisos,
  };
}
