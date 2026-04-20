import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailTurnoCancelado } from "@/lib/email";
import { pushAlPaciente, pushAlMedico } from "@/lib/push";

type ResultadoCancelacion = {
  ok: boolean;
  reembolso: boolean;
  error?: string;
};

export type CreditoPendiente = {
  turno_id: string;
  fecha_cancelacion: string;
  fecha_vencimiento: string;
  monto: number | null;
  reprogramaciones: number;
};

const DIAS_CREDITO = 45;

function esMasDe48hAntes(fecha: string, horaInicio: string): boolean {
  const turnoDate = new Date(`${fecha}T${horaInicio}:00-03:00`);
  const ahora = new Date();
  const diffMs = turnoDate.getTime() - ahora.getTime();
  return diffMs > 48 * 60 * 60 * 1000;
}

export async function cancelarTurnoPorPaciente(
  turnoId: string,
  pacienteId: string,
  motivo?: string
): Promise<ResultadoCancelacion> {
  const supabase = createAdminClient();

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, estado, paciente_id, fecha, hora_inicio, hora_fin, medico_id, monto")
    .eq("id", turnoId)
    .single();

  if (!turno) return { ok: false, reembolso: false, error: "Turno no encontrado." };
  if (turno.paciente_id !== pacienteId) return { ok: false, reembolso: false, error: "Este turno no te pertenece." };
  if (turno.estado !== "confirmado" && turno.estado !== "en_espera") {
    return { ok: false, reembolso: false, error: "Este turno no se puede cancelar." };
  }

  const reembolso = esMasDe48hAntes(turno.fecha, turno.hora_inicio);

  const { error } = await supabase
    .from("turnos")
    .update({
      estado: "cancelado_paciente",
      motivo_cancelacion: motivo || null,
      reintegro_estado: reembolso ? "reembolsado" : null,
    })
    .eq("id", turnoId);

  if (error) return { ok: false, reembolso: false, error: error.message };

  await supabase.from("turnos").insert({
    medico_id: turno.medico_id,
    fecha: turno.fecha,
    hora_inicio: turno.hora_inicio,
    hora_fin: turno.hora_fin,
    estado: "disponible",
    monto: turno.monto,
  });

  enviarEmailTurnoCancelado(turnoId, "paciente").catch(console.error);

  await insertarMensajeSistema(
    turnoId,
    pacienteId,
    turno.medico_id,
    `Cancelaste el turno del ${formatearFechaCorta(turno.fecha)}. ${reembolso ? "Tu reembolso fue procesado." : "No aplica reembolso (menos de 48hs de anticipación)."}`
  );

  const { data: pacNombre } = await supabase
    .from("pacientes").select("nombre_completo").eq("id", pacienteId).single();
  pushAlMedico(turno.medico_id, {
    title: "🔴 Docto",
    body: `${pacNombre?.nombre_completo ?? "Un paciente"} canceló su turno del ${formatearFechaCorta(turno.fecha)}`,
    url: "/medico/agenda",
    tag: `cancelado-pac-${turnoId}`,
  }).catch(() => {});

  return { ok: true, reembolso };
}

export async function cancelarTurnoPorMedico(
  turnoId: string,
  medicoId: string,
  motivo?: string
): Promise<ResultadoCancelacion> {
  const supabase = createAdminClient();

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, estado, paciente_id, medico_id, fecha, hora_inicio, monto")
    .eq("id", turnoId)
    .single();

  if (!turno) return { ok: false, reembolso: false, error: "Turno no encontrado." };
  if (turno.medico_id !== medicoId) return { ok: false, reembolso: false, error: "No es tu turno." };
  if (turno.estado !== "confirmado" && turno.estado !== "en_espera") {
    return { ok: false, reembolso: false, error: "Este turno no se puede cancelar." };
  }

  const { error } = await supabase
    .from("turnos")
    .update({
      estado: "cancelado_medico",
      motivo_cancelacion: motivo || null,
      reintegro_estado: "pendiente",
    })
    .eq("id", turnoId);

  if (error) return { ok: false, reembolso: false, error: error.message };

  enviarEmailTurnoCancelado(turnoId, "medico").catch(console.error);

  if (turno.paciente_id) {
    const { data: medico } = await supabase
      .from("medicos")
      .select("nombre_completo, slug")
      .eq("id", medicoId)
      .single();

    const slug = medico?.slug ?? "";
    await insertarMensajeSistema(
      turnoId,
      turno.paciente_id,
      medicoId,
      `El Dr/a. ${medico?.nombre_completo ?? "médico"} canceló el turno del ${formatearFechaCorta(turno.fecha)}. Podés reprogramar desde docto.com.ar/dr/${slug}`
    );

    pushAlPaciente(turno.paciente_id, {
      title: "🔴 Docto",
      body: `Tu turno del ${formatearFechaCorta(turno.fecha)} fue cancelado. Podés reprogramar.`,
      url: `/dr/${slug}`,
      tag: `cancelado-${turnoId}`,
    }).catch(() => {});
  }

  return { ok: true, reembolso: true };
}

export async function reprogramarTurno(
  turnoOrigenId: string,
  nuevoTurnoId: string,
  pacienteId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();

  // RPC atómica: reserva turno + marca crédito en una sola transacción SQL
  const { data, error } = await supabase.rpc("reprogramar_turno_atomico", {
    p_turno_origen_id: turnoOrigenId,
    p_nuevo_turno_id: nuevoTurnoId,
    p_paciente_id: pacienteId,
  });

  if (error) return { ok: false, error: error.message };

  const resultado = data as string;
  if (resultado !== "ok") return { ok: false, error: resultado };

  // Mensaje sistema (no crítico, fuera de la transacción)
  const { data: nuevoTurno } = await supabase
    .from("turnos")
    .select("fecha, hora_inicio, medico_id")
    .eq("id", nuevoTurnoId)
    .single();

  if (nuevoTurno) {
    await insertarMensajeSistema(
      nuevoTurnoId,
      pacienteId,
      nuevoTurno.medico_id,
      `Tu turno fue reprogramado al ${formatearFechaCorta(nuevoTurno.fecha)} a las ${nuevoTurno.hora_inicio.slice(0, 5)}.`
    );
  }

  return { ok: true };
}

// Detectar créditos pendientes por DB (no query param)
export async function obtenerCreditosPendientes(
  pacienteId: string,
  medicoId: string
): Promise<CreditoPendiente[]> {
  const supabase = createAdminClient();

  const fechaLimite = new Date(Date.now() - DIAS_CREDITO * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("turnos")
    .select("id, updated_at, monto, reprogramaciones")
    .eq("paciente_id", pacienteId)
    .eq("medico_id", medicoId)
    .eq("estado", "cancelado_medico")
    .eq("reintegro_estado", "pendiente")
    .lt("reprogramaciones", 2)
    .gte("updated_at", fechaLimite)
    .order("updated_at", { ascending: false });

  if (!data) return [];

  return data.map((t) => {
    const fechaCancelacion = new Date(t.updated_at);
    const fechaVencimiento = new Date(fechaCancelacion.getTime() + DIAS_CREDITO * 24 * 60 * 60 * 1000);
    return {
      turno_id: t.id,
      fecha_cancelacion: t.updated_at,
      fecha_vencimiento: fechaVencimiento.toISOString(),
      monto: t.monto,
      reprogramaciones: t.reprogramaciones ?? 0,
    };
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function insertarMensajeSistema(
  turnoId: string,
  pacienteId: string,
  medicoId: string,
  contenido: string
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("mensajes_sistema").insert({
    turno_id: turnoId,
    paciente_id: pacienteId,
    medico_id: medicoId,
    contenido,
  });
  if (error) console.error("Error insertando mensaje sistema:", error.message);
}

function formatearFechaCorta(fecha: string): string {
  const d = new Date(fecha + "T12:00:00");
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
