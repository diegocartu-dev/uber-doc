import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailTurnoCancelado } from "@/lib/email";
import { pushAlPaciente, pushAlMedico } from "@/lib/push";
import { cerrarEntradaSala } from "@/lib/sala-espera";
import { refundTotal } from "@/lib/mp-refund";
import { decrypt } from "@/lib/mp-crypto";
import { registrarRefundPendiente } from "@/lib/refunds-pendientes";
import { logInfo, logError } from "@/lib/logger";

type ResultadoCancelacion = {
  ok: boolean;
  reembolso: boolean;
  error?: string;
};

function esMasDe48hAntes(fecha: string, horaInicio: string): boolean {
  const turnoDate = new Date(`${fecha}T${horaInicio}:00-03:00`);
  const ahora = new Date();
  const diffMs = turnoDate.getTime() - ahora.getTime();
  return diffMs > 48 * 60 * 60 * 1000;
}

type ReintegroEstado = "reembolsado" | "fee_pendiente" | "pendiente" | null;

export async function ejecutarRefund(
  recursoId: string,
  medicoId: string,
  pagoId: string,
  netoMedico: number,
  applicationFee: number,
  tipo: "turno" | "consulta" = "turno"
): Promise<ReintegroEstado> {
  const supabase = createAdminClient();

  const { data: mpAccount } = await supabase
    .from("medicos_mp_accounts")
    .select("access_token_encrypted")
    .eq("medico_id", medicoId)
    .eq("estado", "activo")
    .maybeSingle();

  if (!mpAccount?.access_token_encrypted) {
    logError("[REFUND]", "Sin token MP del médico", { recursoId, medicoId });
    return "pendiente";
  }

  let tokenMedico: string;
  try {
    tokenMedico = decrypt(mpAccount.access_token_encrypted);
  } catch (err) {
    logError("[REFUND]", "Error desencriptando token médico", { recursoId, medicoId, error: String(err) });
    return "pendiente";
  }

  // UN solo refund total con el token del MÉDICO. MP revierte automáticamente la
  // comisión de Docto (vive en la cuenta marketplace/GREBA) por el split — no hay
  // pata de fee separada (la vieja `refundConReversionDeFee` fallaba en prod con
  // "Payment not found" al intentar el fee con el token de GREBA).
  const result = await refundTotal(pagoId, tokenMedico, `refund:${tipo}:${recursoId}`);

  logInfo("[REFUND]", "Resultado refund total", {
    recursoId,
    ok: result.ok,
    status: result.status,
    insufficientFunds: !result.ok && result.insufficientFunds,
  });

  if (result.ok) return "reembolsado";

  // Falló → encolar para reintento diario (cron). El refund total ya incluye la
  // comisión de Docto, así que ya no hay estado `fee_pendiente`.
  await registrarRefundPendiente({
    tipo,
    recursoId,
    medicoId,
    pagoId,
    netoMedico,
    applicationFee,
    estado: "pendiente",
    error: result.error,
  });

  if (result.insufficientFunds) {
    logError("[REFUND]", "Médico sin saldo — reintento diario / escala a CVU a las 48h", { recursoId, medicoId });
    // Notificación inmediata: el médico necesita saldo para que el refund proceda.
    pushAlMedico(medicoId, {
      title: "Reembolso pendiente",
      body: "Un paciente canceló y su reembolso necesita saldo en tu cuenta de Mercado Pago. Lo reintentamos cada 24hs.",
      url: "/dashboard",
      tag: `refund-pendiente-${recursoId}`,
    }).catch(() => {});
  }

  return "pendiente";
}

export async function cancelarTurnoPorPaciente(
  turnoId: string,
  pacienteId: string,
  motivo?: string
): Promise<ResultadoCancelacion> {
  const supabase = createAdminClient();

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, estado, paciente_id, fecha, hora_inicio, hora_fin, medico_id, monto, pago_id, mp_net_amount_medico, mp_application_fee")
    .eq("id", turnoId)
    .single();

  if (!turno) return { ok: false, reembolso: false, error: "Turno no encontrado." };
  if (turno.paciente_id !== pacienteId) return { ok: false, reembolso: false, error: "Este turno no te pertenece." };
  if (turno.estado !== "confirmado" && turno.estado !== "en_espera") {
    return { ok: false, reembolso: false, error: "Este turno no se puede cancelar." };
  }

  const reembolso = esMasDe48hAntes(turno.fecha, turno.hora_inicio);

  // Refund total: solo se necesita el pago_id (MP revierte la parte del médico y la
  // comisión de Docto por el split). Los montos van solo para la cola/escalada.
  let reintegroEstado: ReintegroEstado = null;
  if (reembolso && turno.pago_id) {
    reintegroEstado = await ejecutarRefund(
      turnoId,
      turno.medico_id,
      turno.pago_id,
      turno.mp_net_amount_medico ?? 0,
      turno.mp_application_fee ?? 0
    );
  }

  const { error } = await supabase
    .from("turnos")
    .update({
      estado: "cancelado_paciente",
      motivo_cancelacion: motivo || null,
      reintegro_estado: reintegroEstado,
    })
    .eq("id", turnoId);

  if (error) return { ok: false, reembolso: false, error: error.message };

  cerrarEntradaSala({ turnoId, motivo: "cancelado_paciente" }).catch(() => {});

  await supabase.from("turnos").insert({
    medico_id: turno.medico_id,
    fecha: turno.fecha,
    hora_inicio: turno.hora_inicio,
    hora_fin: turno.hora_fin,
    estado: "disponible",
    monto: turno.monto,
  });

  enviarEmailTurnoCancelado(turnoId, "paciente").catch(console.error);

  const reembolsoMsg = reembolso
    ? (reintegroEstado === "reembolsado"
        ? "Tu reembolso fue procesado."
        : "Tu reembolso está en proceso.")
    : "No aplica reembolso (menos de 48hs de anticipación).";

  await insertarMensajeSistema(
    turnoId,
    pacienteId,
    turno.medico_id,
    `Cancelaste el turno del ${formatearFechaCorta(turno.fecha)}. ${reembolsoMsg}`
  );

  const { data: pacNombre } = await supabase
    .from("pacientes").select("nombre_completo").eq("id", pacienteId).single();
  pushAlMedico(turno.medico_id, {
    title: "🔴 Docto",
    body: `${pacNombre?.nombre_completo ?? "Un paciente"} canceló su turno del ${formatearFechaCorta(turno.fecha)}`,
    url: "/medico/agenda",
    tag: `cancelado-pac-${turnoId}`,
    silent: true,
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
    .select("id, estado, paciente_id, medico_id, fecha, hora_inicio, monto, pago_id, mp_net_amount_medico, mp_application_fee")
    .eq("id", turnoId)
    .single();

  if (!turno) return { ok: false, reembolso: false, error: "Turno no encontrado." };
  if (turno.medico_id !== medicoId) return { ok: false, reembolso: false, error: "No es tu turno." };
  if (turno.estado !== "confirmado" && turno.estado !== "en_espera") {
    return { ok: false, reembolso: false, error: "Este turno no se puede cancelar." };
  }

  let reintegroEstado: ReintegroEstado = null;
  if (turno.pago_id) {
    reintegroEstado = await ejecutarRefund(
      turnoId,
      turno.medico_id,
      turno.pago_id,
      turno.mp_net_amount_medico ?? 0,
      turno.mp_application_fee ?? 0
    );
  }

  const { error } = await supabase
    .from("turnos")
    .update({
      estado: "cancelado_medico",
      motivo_cancelacion: motivo || null,
      reintegro_estado: reintegroEstado,
    })
    .eq("id", turnoId);

  if (error) return { ok: false, reembolso: false, error: error.message };

  cerrarEntradaSala({ turnoId, motivo: "cancelado_medico" }).catch(() => {});

  enviarEmailTurnoCancelado(turnoId, "medico").catch(console.error);

  if (turno.paciente_id) {
    const { data: medico } = await supabase
      .from("medicos")
      .select("nombre_completo, slug")
      .eq("id", medicoId)
      .single();

    const slug = medico?.slug ?? "";
    const reembolsoMsg = reintegroEstado === "reembolsado"
      ? " Tu reembolso fue procesado."
      : reintegroEstado === "fee_pendiente" || reintegroEstado === "pendiente"
        ? " Tu reembolso está en proceso."
        : "";

    await insertarMensajeSistema(
      turnoId,
      turno.paciente_id,
      medicoId,
      `El Dr/a. ${medico?.nombre_completo ?? "médico"} canceló el turno del ${formatearFechaCorta(turno.fecha)}.${reembolsoMsg} Podés reprogramar desde docto.com.ar/dr/${slug}`
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

  const { data, error } = await supabase.rpc("reprogramar_turno_atomico", {
    p_turno_origen_id: turnoOrigenId,
    p_nuevo_turno_id: nuevoTurnoId,
    p_paciente_id: pacienteId,
  });

  if (error) return { ok: false, error: error.message };

  const resultado = data as string;
  if (resultado !== "ok") return { ok: false, error: resultado };

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

// Reprogramación INICIADA POR EL MÉDICO: mueve un turno confirmado a otro slot
// disponible, preservando el pago. Usa el RPC dedicado reprogramar_turno_medico
// (NO el del paciente, que tiene reglas de crédito). Notifica al paciente.
export async function reprogramarTurnoMedico(
  turnoOrigenId: string,
  nuevoTurnoId: string,
  medicoId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("reprogramar_turno_medico", {
    p_turno_origen_id: turnoOrigenId,
    p_nuevo_turno_id: nuevoTurnoId,
    p_medico_id: medicoId,
  });

  if (error) return { ok: false, error: error.message };

  const resultado = data as string;
  if (resultado !== "ok") return { ok: false, error: resultado };

  // Notificar al paciente del nuevo horario (paciente_id se deriva del turno movido)
  const { data: nuevoTurno } = await supabase
    .from("turnos")
    .select("fecha, hora_inicio, medico_id, paciente_id")
    .eq("id", nuevoTurnoId)
    .single();

  if (nuevoTurno?.paciente_id) {
    await insertarMensajeSistema(
      nuevoTurnoId,
      nuevoTurno.paciente_id,
      nuevoTurno.medico_id,
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
