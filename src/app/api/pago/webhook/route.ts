import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHmac, timingSafeEqual } from "crypto";
import { sendDoctoAlert } from "@/lib/alertas";
import { logInfo, logWarn, logError } from "@/lib/logger";
import { trackEvent } from "@/lib/funnel";
import { pushAlMedico } from "@/lib/push";
import { enviarEmailTurnoConfirmado } from "@/lib/email";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function verificarFirmaMP(req: NextRequest, body: unknown): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;

  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  if (!xSignature || !xRequestId) return false;

  const parts = Object.fromEntries(
    xSignature.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k.trim(), v.join("=")];
    })
  );

  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const dataId = (body as { data?: { id?: string } })?.data?.id;
  const manifest = `id:${dataId ?? ""};request-id:${xRequestId};ts:${ts};`;

  const hmac = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(v1));
  } catch {
    return false;
  }
}

function parseExternalReference(ref: string | undefined | null): { tipo: "consulta" | "turno"; id: string } | null {
  if (!ref) return null;

  const parts = ref.split(":");
  if (parts.length === 2) {
    const [tipo, id] = parts;
    if ((tipo === "consulta" || tipo === "turno") && UUID_RE.test(id)) {
      return { tipo, id };
    }
  }

  if (UUID_RE.test(ref)) {
    return { tipo: "consulta", id: ref };
  }

  return null;
}

async function checkRateLimit(ip: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("webhook_failed_attempts")
    .select("attempts_count, first_attempt_at, blocked_until")
    .eq("ip", ip)
    .single();

  if (!data) return false;

  if (data.blocked_until && new Date(data.blocked_until) > new Date()) {
    return true;
  }

  return false;
}

async function recordFailedAttempt(ip: string): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("webhook_failed_attempts")
    .select("attempts_count, first_attempt_at")
    .eq("ip", ip)
    .single();

  if (!existing) {
    await admin.from("webhook_failed_attempts").insert({
      ip,
      attempts_count: 1,
      first_attempt_at: now,
      blocked_until: null,
    });
    return;
  }

  const windowStart = new Date(existing.first_attempt_at);
  const windowEnd = new Date(windowStart.getTime() + 60 * 1000);

  if (new Date() > windowEnd) {
    await admin
      .from("webhook_failed_attempts")
      .update({ attempts_count: 1, first_attempt_at: now, blocked_until: null })
      .eq("ip", ip);
    return;
  }

  const newCount = existing.attempts_count + 1;
  const blocked = newCount >= 10
    ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
    : null;

  await admin
    .from("webhook_failed_attempts")
    .update({ attempts_count: newCount, blocked_until: blocked })
    .eq("ip", ip);

  if (blocked) {
    logWarn("[WEBHOOK]", "IP bloqueada por exceso de firmas inválidas", { ip, attempts: newCount });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? req.headers.get("x-real-ip")
      ?? "unknown";

    if (await checkRateLimit(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();

    if (!verificarFirmaMP(req, body)) {
      logError("[WEBHOOK]", "Firma HMAC inválida", { ip });
      await recordFailedAttempt(ip);
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }

    const { action, data } = body;

    if (action === "application.deauthorized") {
      await handleDeauthorized(data);
      return NextResponse.json({ received: true });
    }

    if (action !== "payment.created" && action !== "payment.updated") {
      return NextResponse.json({ received: true });
    }

    if (!data?.id) {
      return NextResponse.json({ received: true });
    }

    await handlePayment(String(data.id));

    return NextResponse.json({ received: true });
  } catch (err) {
    logError("[WEBHOOK]", "Error fatal", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ received: true });
  }
}

async function handlePayment(paymentId: string): Promise<void> {
  const mpToken = process.env.MP_ACCESS_TOKEN;
  const mpTestToken = process.env.MP_ACCESS_TOKEN_TEST;

  if (!mpToken && !mpTestToken) {
    logError("[WEBHOOK]", "Ningún MP_ACCESS_TOKEN configurado");
    return;
  }

  // Intentar con token de producción primero, fallback a test token (sandbox).
  // Pagos sandbox no son accesibles con token de producción y viceversa.
  let paymentRes: Response | null = null;

  if (mpToken) {
    paymentRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${mpToken}` } }
    );
  }

  if ((!paymentRes || !paymentRes.ok) && mpTestToken) {
    logInfo("[WEBHOOK]", "Reintentando con test token (sandbox)", { paymentId });
    paymentRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${mpTestToken}` } }
    );
  }

  if (!paymentRes || !paymentRes.ok) {
    logError("[WEBHOOK]", "Error fetching payment", { paymentId, mpStatus: paymentRes?.status ?? "no_response" });
    return;
  }

  const payment = await paymentRes.json();
  const status: string = payment.status;
  const externalRef = payment.external_reference;
  const parsed = parseExternalReference(externalRef);

  if (!parsed) {
    logWarn("[WEBHOOK]", "external_reference no parseable", { externalRef });
    return;
  }

  const { tipo, id } = parsed;
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from(tipo === "consulta" ? "consultas" : "turnos")
    .select("pago_id, mp_status")
    .eq("id", id)
    .single();

  if (existing?.pago_id === paymentId && existing?.mp_status === status) {
    logInfo("[WEBHOOK]", "Evento ya procesado", { paymentId, status, tipo, id });
    return;
  }

  const applicationFee = payment.fee_details?.find(
    (f: { type: string }) => f.type === "mercadopago_fee"
  )?.amount ?? payment.marketplace_fee ?? 0;
  const transactionAmount: number = payment.transaction_amount ?? 0;
  const dateCreated: string | null = payment.date_created ?? null;

  const logCtx = { paymentId, status, tipo, id };

  if (status === "approved") {
    await handleApproved(admin, tipo, id, paymentId, transactionAmount, applicationFee, dateCreated, logCtx);
  } else if (status === "rejected") {
    await handleRejected(admin, tipo, id, paymentId, logCtx);
  } else if (status === "refunded") {
    await handleStatusOnly(admin, tipo, id, paymentId, "refunded", logCtx);
  } else if (status === "charged_back") {
    await handleChargedBack(admin, tipo, id, paymentId, transactionAmount, logCtx);
  } else {
    logInfo("[WEBHOOK]", "Estado pendiente, sin acción", logCtx);
  }
}

async function handleApproved(
  admin: ReturnType<typeof createAdminClient>,
  tipo: "consulta" | "turno",
  id: string,
  paymentId: string,
  transactionAmount: number,
  applicationFee: number,
  dateCreated: string | null,
  logCtx: Record<string, unknown>
): Promise<void> {
  const netAmount = Math.round((transactionAmount - applicationFee) * 100) / 100;

  if (tipo === "consulta") {
    const now = new Date().toISOString();
    const { data: updated } = await admin
      .from("consultas")
      .update({
        pago_id: paymentId,
        monto: Math.round(transactionAmount),
        mp_status: "approved",
        mp_application_fee: applicationFee,
        mp_net_amount_medico: netAmount,
        mp_payment_created_at: dateCreated,
        estado: "en_curso",
        en_curso_at: now,
      })
      .eq("id", id)
      .eq("estado", "aceptada")
      .select("id, medico_id");

    if (!updated?.length) {
      logWarn("[WEBHOOK]", "Consulta no actualizada (estado ya cambió?)", logCtx);
      await sendDoctoAlert(
        `[ALERTA] Pago aprobado pero consulta no actualizada`,
        `Un pago fue aprobado por MP pero el UPDATE no afectó filas.\nEstado fuera de sincronía.\n\nConsulta ID: ${id}\nPayment ID: ${paymentId}\nMonto: $${transactionAmount}\nFecha: ${new Date().toISOString()}\n\nAcción: verificar manualmente en Supabase si la consulta ya cambió de estado.`
      );
    } else {
      logInfo("[WEBHOOK]", "Consulta en_curso (transición automática)", { ...logCtx, transactionAmount, applicationFee, netAmount });
      trackEvent({ evento: "pago_aprobado", pacienteId: null, metadata: { tipo, recursoId: id, paymentId, monto: transactionAmount, fee: applicationFee } });

      const medicoId = updated[0].medico_id;
      if (medicoId) {
        pushAlMedico(medicoId, {
          title: "Nueva consulta lista",
          body: "Un paciente pagó y está esperando. Abrí tu workspace.",
          url: `/medico/consulta/${id}/workspace`,
          tag: `consulta-${id}`,
        }).catch(() => {});
      }
    }
  } else {
    const { data: updated } = await admin
      .from("turnos")
      .update({
        pago_id: paymentId,
        mp_status: "approved",
        mp_application_fee: applicationFee,
        mp_net_amount_medico: netAmount,
        mp_payment_created_at: dateCreated,
        estado: "confirmado",
      })
      .eq("id", id)
      .eq("estado", "reservado_pendiente")
      .select("id, medico_id, paciente_id, fecha");

    if (!updated?.length) {
      logWarn("[WEBHOOK]", "Turno no actualizado (estado ya cambió?)", logCtx);
      await sendDoctoAlert(
        `[ALERTA] Pago aprobado pero turno no actualizado`,
        `Un pago fue aprobado por MP pero el UPDATE no afectó filas.\nEstado fuera de sincronía.\n\nTurno ID: ${id}\nPayment ID: ${paymentId}\nMonto: $${transactionAmount}\nFecha: ${new Date().toISOString()}\n\nAcción: verificar manualmente en Supabase si el turno ya cambió de estado.`
      );
    } else {
      logInfo("[WEBHOOK]", "Turno confirmado", { ...logCtx, transactionAmount, applicationFee, netAmount });
      trackEvent({ evento: "pago_aprobado", pacienteId: null, metadata: { tipo, recursoId: id, paymentId, monto: transactionAmount, fee: applicationFee } });

      // Notificaciones de confirmación (paridad con confirmarPagoTurno del flujo
      // simulado): email al paciente + push al médico. Fire-and-forget.
      const turnoConfirmado = updated[0];
      enviarEmailTurnoConfirmado(id).catch(() => {});
      if (turnoConfirmado.medico_id) {
        let pacienteNombre = "Un paciente";
        if (turnoConfirmado.paciente_id) {
          const { data: pac } = await admin
            .from("pacientes")
            .select("nombre_completo")
            .eq("id", turnoConfirmado.paciente_id)
            .single();
          pacienteNombre = pac?.nombre_completo ?? pacienteNombre;
        }
        pushAlMedico(turnoConfirmado.medico_id, {
          title: "🟢 Docto",
          body: `${pacienteNombre} reservó un turno para el ${turnoConfirmado.fecha}`,
          url: "/medico/agenda",
          tag: `reserva-${id}`,
          silent: true,
        }).catch(() => {});
      }
    }
  }
}

async function handleRejected(
  admin: ReturnType<typeof createAdminClient>,
  tipo: "consulta" | "turno",
  id: string,
  paymentId: string,
  logCtx: Record<string, unknown>
): Promise<void> {
  const table = tipo === "consulta" ? "consultas" : "turnos";
  await admin
    .from(table)
    .update({ pago_id: paymentId, mp_status: "rejected" })
    .eq("id", id);

  logInfo("[WEBHOOK]", "Pago rechazado", logCtx);
  trackEvent({ evento: "pago_rechazado", pacienteId: null, metadata: { tipo, recursoId: id, paymentId } });
}

async function handleStatusOnly(
  admin: ReturnType<typeof createAdminClient>,
  tipo: "consulta" | "turno",
  id: string,
  paymentId: string,
  mpStatus: string,
  logCtx: Record<string, unknown>
): Promise<void> {
  const table = tipo === "consulta" ? "consultas" : "turnos";
  await admin
    .from(table)
    .update({ pago_id: paymentId, mp_status: mpStatus })
    .eq("id", id);

  logInfo("[WEBHOOK]", "Status actualizado", { ...logCtx, mpStatus });
  if (mpStatus === "refunded") {
    trackEvent({ evento: "pago_refund", pacienteId: null, metadata: { tipo, recursoId: id, paymentId } });
  }
}

async function handleChargedBack(
  admin: ReturnType<typeof createAdminClient>,
  tipo: "consulta" | "turno",
  id: string,
  paymentId: string,
  amount: number,
  logCtx: Record<string, unknown>
): Promise<void> {
  const table = tipo === "consulta" ? "consultas" : "turnos";
  await admin
    .from(table)
    .update({ pago_id: paymentId, mp_status: "charged_back" })
    .eq("id", id);

  logError("[WEBHOOK]", "ALERTA CHARGEBACK", { ...logCtx, amount });

  await sendDoctoAlert(
    `[CRÍTICO] Chargeback recibido — ${tipo} ${id}`,
    `Se recibió un chargeback de Mercado Pago.\n\nTipo: ${tipo}\nID: ${id}\nPayment ID: ${paymentId}\nMonto: $${amount}\nFecha: ${new Date().toISOString()}\n\nAcción URGENTE: revisar en panel de MP y contactar al paciente/médico.`
  );
  trackEvent({ evento: "pago_chargeback", pacienteId: null, metadata: { tipo, recursoId: id, paymentId, monto: amount } });
}

async function handleDeauthorized(data: { user_id?: string } | undefined): Promise<void> {
  if (!data?.user_id) {
    logWarn("[WEBHOOK]", "application.deauthorized sin user_id");
    return;
  }

  const mpUserId = String(data.user_id);
  const admin = createAdminClient();

  const { data: account } = await admin
    .from("medicos_mp_accounts")
    .select("medico_id")
    .eq("mp_user_id", mpUserId)
    .single();

  if (!account) {
    logWarn("[WEBHOOK]", "application.deauthorized mp_user_id no encontrado", { mpUserId });
    return;
  }

  await admin
    .from("medicos_mp_accounts")
    .update({
      estado: "revocado",
      desconectado_en: new Date().toISOString(),
      last_refresh_status: "revoked",
    })
    .eq("mp_user_id", mpUserId);

  logInfo("[WEBHOOK]", "Médico desconectó MP", { mpUserId, medicoId: account.medico_id });

  await sendDoctoAlert(
    `[INFO] Médico desconectó Mercado Pago`,
    `Un médico desconectó su cuenta de MP desde el panel de Mercado Pago.\n\nMédico ID: ${account.medico_id}\nMP User ID: ${mpUserId}\nFecha: ${new Date().toISOString()}\n\nAcción: verificar si el médico tiene turnos futuros con pacientes que ya pagaron. Si tiene, contactarlo.`
  );
}
