import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailTurnoCancelado } from "@/lib/email";

type ResultadoCancelacion = {
  ok: boolean;
  reembolso: boolean;
  error?: string;
};

function esMasDe48hAntes(fecha: string, horaInicio: string): boolean {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const [hh, mm] = horaInicio.split(":").map(Number);
  const turnoDate = new Date(anio, mes - 1, dia, hh, mm);
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
    .select("id, estado, paciente_id, fecha, hora_inicio, medico_id, monto")
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
      reintegro_estado: reembolso ? "acreditado" : null,
    })
    .eq("id", turnoId);

  if (error) return { ok: false, reembolso: false, error: error.message };

  // Devolver slot al pool: crear nuevo turno disponible
  await supabase.from("turnos").insert({
    medico_id: turno.medico_id,
    fecha: turno.fecha,
    hora_inicio: turno.hora_inicio,
    hora_fin: turno.hora_inicio, // se recalcula abajo
    estado: "disponible",
    monto: turno.monto,
  });

  enviarEmailTurnoCancelado(turnoId, "paciente").catch(console.error);

  // Mensaje sistema
  await insertarMensajeSistema(
    turnoId,
    pacienteId,
    turno.medico_id,
    `Cancelaste el turno del ${formatearFechaCorta(turno.fecha)}. ${reembolso ? "Tu reembolso fue procesado." : "No aplica reembolso (menos de 48hs de anticipación)."}`
  );

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
  }

  return { ok: true, reembolso: true };
}

export async function reprogramarTurno(
  turnoOrigenId: string,
  nuevoTurnoId: string,
  pacienteId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();

  // Verificar turno original cancelado por médico con crédito pendiente
  const { data: origen } = await supabase
    .from("turnos")
    .select("id, estado, paciente_id, medico_id, reprogramaciones, reintegro_estado")
    .eq("id", turnoOrigenId)
    .single();

  if (!origen) return { ok: false, error: "Turno original no encontrado." };
  if (origen.paciente_id !== pacienteId) return { ok: false, error: "No te pertenece." };
  if (origen.reintegro_estado !== "pendiente") return { ok: false, error: "Sin crédito disponible." };
  if ((origen.reprogramaciones ?? 0) >= 2) return { ok: false, error: "Máximo 2 reprogramaciones por médico alcanzado." };

  // Verificar nuevo turno disponible
  const { data: nuevo } = await supabase
    .from("turnos")
    .select("id, estado, medico_id")
    .eq("id", nuevoTurnoId)
    .single();

  if (!nuevo || nuevo.estado !== "disponible") return { ok: false, error: "Turno no disponible." };
  if (nuevo.medico_id !== origen.medico_id) return { ok: false, error: "Solo podés reprogramar con el mismo médico." };

  // Reservar nuevo turno con crédito
  const { error: errNuevo } = await supabase
    .from("turnos")
    .update({
      estado: "confirmado",
      paciente_id: pacienteId,
      turno_origen_id: turnoOrigenId,
      reprogramaciones: (origen.reprogramaciones ?? 0) + 1,
    })
    .eq("id", nuevoTurnoId)
    .eq("estado", "disponible");

  if (errNuevo) return { ok: false, error: errNuevo.message };

  // Marcar crédito como usado
  await supabase
    .from("turnos")
    .update({ reintegro_estado: "acreditado" })
    .eq("id", turnoOrigenId);

  // Mensaje sistema
  const { data: nuevoTurno } = await supabase
    .from("turnos")
    .select("fecha, hora_inicio")
    .eq("id", nuevoTurnoId)
    .single();

  if (nuevoTurno) {
    await insertarMensajeSistema(
      nuevoTurnoId,
      pacienteId,
      origen.medico_id,
      `Tu turno fue reprogramado al ${formatearFechaCorta(nuevoTurno.fecha)} a las ${nuevoTurno.hora_inicio.slice(0, 5)}.`
    );
  }

  return { ok: true };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function insertarMensajeSistema(
  turnoId: string,
  pacienteId: string,
  medicoId: string,
  contenido: string
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("mensajes_sistema").insert({
    turno_id: turnoId,
    paciente_id: pacienteId,
    medico_id: medicoId,
    contenido,
  });
}

function formatearFechaCorta(fecha: string): string {
  const d = new Date(fecha + "T12:00:00");
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
