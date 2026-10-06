import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHmac, timingSafeEqual } from "crypto";
import { sendDoctoAlert } from "@/lib/alertas";
import { logInfo, logWarn, logError } from "@/lib/logger";
import { trackEvent } from "@/lib/funnel";
import { pushAlMedico } from "@/lib/push";
import { avisarMedicoTurnoWhatsApp, fechaTurnoParaAviso } from "@/lib/whatsapp";
import { waitUntil } from "@vercel/functions";
import { enviarEmailTurnoConfirmado } from "@/lib/email";
import { assertNoInstitucional } from "@/lib/instancia";
import { presenciaDelPaciente, decidirReaccionADevolucion } from "@/lib/video/presencia";

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
  // Modo institucional: sin Mercado Pago — este endpoint no existe (Capa B).
  if (!assertNoInstitucional()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
    // Un `refunded` repetido vuelve a pasar por la reacción, que es idempotente:
    // si la primera vez falló después de anotar `mp_status`, el reintento de MP
    // es la única segunda oportunidad.
    if (status === "refunded") await reaccionarADevolucionExterna(admin, tipo, id, paymentId, { paymentId, status, tipo, id });
    return;
  }

  const transactionAmount: number = payment.transaction_amount ?? 0;
  const dateCreated: string | null = payment.date_created ?? null;

  // Comisión REAL de Docto = el `marketplace_fee` que enviamos en crear-v2 (lo que
  // efectivamente cobra Docto). NO usar `mercadopago_fee` de `fee_details`: ese es la
  // comisión interna de procesamiento de Mercado Pago (un número distinto y más bajo,
  // ~$1.290 en un pago de $30.000), no la comisión de Docto ($1.500 = 5%).
  // Fuente primaria: metadata.marketplace_fee (lo que mandamos). Fallbacks: recálculo
  // por comision_pct (misma fórmula que crear-v2), o el campo marketplace_fee del pago.
  const metaFee = Number(payment.metadata?.marketplace_fee);
  const metaPct = Number(payment.metadata?.comision_pct);
  const applicationFee =
    Number.isFinite(metaFee) && metaFee > 0
      ? metaFee
      : Number.isFinite(metaPct) && metaPct > 0
        ? Math.round(transactionAmount * (metaPct / 100) * 100) / 100
        : typeof payment.marketplace_fee === "number" && payment.marketplace_fee > 0
          ? payment.marketplace_fee
          : 0;

  const logCtx = { paymentId, status, tipo, id };

  if (status === "approved") {
    await handleApproved(admin, tipo, id, paymentId, transactionAmount, applicationFee, dateCreated, logCtx);
  } else if (status === "rejected") {
    await handleRejected(admin, tipo, id, paymentId, payment.status_detail ?? null, logCtx);
  } else if (status === "refunded") {
    await handleStatusOnly(admin, tipo, id, paymentId, "refunded", logCtx);
  } else if (status === "charged_back") {
    await handleChargedBack(admin, tipo, id, paymentId, transactionAmount, logCtx);
  } else {
    // Estados en vuelo (pending = cupón Rapipago/Pago Fácil, in_process =
    // revisión de MP, authorized = tarjeta autorizada sin capturar). Antes solo
    // se logueaban, así que `mp_status` quedaba NULL y esa plata en camino era
    // invisible para el resto del sistema — en particular para el cron que
    // libera reservas vencidas, que veía el turno como abandonado (hallazgo
    // 06/08). Persistirlos es lo que le permite NO tocar ese turno.
    await handleStatusOnly(admin, tipo, id, paymentId, status, logCtx);
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
      // El UPDATE no afectó filas. Puede ser: (a) reentrega benigna de MP — MP
      // manda 2 webhooks por pago (created + updated); el primero ya transicionó
      // la consulta y este segundo no matchea — o (b) estado realmente fuera de
      // sincronía. Distinguimos para no alertar en cada pago aprobado.
      const { data: ya } = await admin
        .from("consultas")
        .select("estado, pago_id, medico_id")
        .eq("id", id)
        .maybeSingle();
      const reentregaBenigna = ya?.pago_id === paymentId && ya?.estado !== "aceptada";

      // LA PLATA ENTRÓ SOBRE UNA CONSULTA YA CERRADA (10/09/2026).
      // Caso: el paciente estaba adentro del checkout cuando la consulta se
      // cerró — el plazo de pago, o el profesional cancelando. `crear-v2` no
      // escribe nada en la fila, así que hasta este webhook nadie sabía que
      // había un pago en vuelo. Antes esto solo dejaba un mail de alerta: la
      // fila quedaba SIN `pago_id`, y sin `pago_id` el reembolso automático no
      // tiene con qué encontrar el pago (lo exige `ejecutarRefund`), así que
      // había que ir a buscarlo a mano a Mercado Pago.
      // Ahora el rastro del pago se escribe SOBRE la fila cerrada —sin tocar su
      // estado, que ya es el correcto— y el reembolso se dispara solo. Si falla,
      // cae en `refunds_pendientes` y lo levanta el cron de reintentos.
      if (!reentregaBenigna && ya?.estado === "cancelada" && !ya?.pago_id && ya?.medico_id) {
        await admin
          .from("consultas")
          .update({
            pago_id: paymentId,
            monto: Math.round(transactionAmount),
            mp_status: "approved",
            mp_application_fee: applicationFee,
            mp_net_amount_medico: netAmount,
            mp_payment_created_at: dateCreated,
          })
          .eq("id", id)
          .is("pago_id", null);

        const { ejecutarRefund } = await import("@/lib/cancelaciones");
        const reintegro = await ejecutarRefund(
          id,
          ya.medico_id,
          paymentId,
          netAmount,
          applicationFee,
          "consulta"
        ).catch(() => null);
        logWarn("[WEBHOOK]", "Pago acreditado sobre consulta cerrada: reembolso disparado", {
          ...logCtx,
          reintegro,
        });
      }
      if (reentregaBenigna) {
        logInfo("[WEBHOOK]", "Consulta: reentrega benigna de MP (ya procesada)", { ...logCtx, estadoActual: ya?.estado });
      } else {
        logWarn("[WEBHOOK]", "Consulta no actualizada (estado fuera de sincronía)", { ...logCtx, estadoActual: ya?.estado });
        await sendDoctoAlert(
          `[ALERTA] Pago aprobado pero consulta no actualizada`,
          `Un pago fue aprobado por MP pero el UPDATE no afectó filas.\nEstado fuera de sincronía.\n\nConsulta ID: ${id}\nEstado actual: ${ya?.estado ?? "desconocido"}\nPayment ID: ${paymentId}\nMonto: $${transactionAmount}\nFecha: ${new Date().toISOString()}\n\nAcción: verificar manualmente en Supabase si la consulta ya cambió de estado.`
        );
      }
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
      .select("id, medico_id, paciente_id, fecha, hora_inicio");

    if (!updated?.length) {
      // El UPDATE no afectó filas. Distinguimos dos casos muy distintos:
      //  (a) Reentrega benigna de MP: el turno ya está confirmado con ESTE pago_id
      //      (MP manda 2 webhooks por pago). No es problema → log, sin alerta.
      //  (b) Race de expiración / estado inesperado: la reserva venció y el turno
      //      volvió a disponible (o lo tomó otro) ANTES de que el pago se aprobara.
      //      El paciente pagó y no tiene turno → alerta real para refund manual.
      const { data: ya } = await admin
        .from("turnos")
        .select("estado, pago_id")
        .eq("id", id)
        .maybeSingle();
      const reentregaBenigna = ya?.pago_id === paymentId && ya?.estado === "confirmado";
      if (reentregaBenigna) {
        logInfo("[WEBHOOK]", "Turno: reentrega benigna de MP (ya confirmado)", { ...logCtx, estadoActual: ya?.estado });
      } else {
        logWarn("[WEBHOOK]", "Turno no confirmado tras pago aprobado (race de expiración?)", { ...logCtx, estadoActual: ya?.estado });
        await sendDoctoAlert(
          `[ALERTA] Pago aprobado pero turno no confirmado`,
          `Un pago fue aprobado por MP pero el turno NO quedó confirmado (la reserva pudo expirar durante el checkout).\n\nTurno ID: ${id}\nEstado actual: ${ya?.estado ?? "desconocido"}\nPayment ID: ${paymentId}\nMonto: $${transactionAmount}\nFecha: ${new Date().toISOString()}\n\nAcción: el paciente pagó y puede haberse quedado sin turno. Verificar y, si corresponde, reasignar el turno o procesar refund.`
        );
      }
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
        const horaTurno = String(turnoConfirmado.hora_inicio ?? "").slice(0, 5);
        const fechaAviso = fechaTurnoParaAviso(turnoConfirmado.fecha);
        // CON sonido (decisión Diego 11/06): el médico se entera sin mirar la app.
        // Con la hora: "reservó un turno para el 2026-10-02" no decía cuándo.
        waitUntil(
          pushAlMedico(turnoConfirmado.medico_id, {
            title: "🟢 Docto",
            body: `${pacienteNombre} reservó un turno para ${fechaAviso} a las ${horaTurno}`,
            url: "/medico/agenda",
            tag: `reserva-${id}`,
          }).catch(() => {})
        );
        // Y por WhatsApp (05/10/2026): el push no llega a un iPhone sin la app, y
        // hasta ahora el primer WhatsApp salía recién con el paciente en la sala.
        waitUntil(
          avisarMedicoTurnoWhatsApp(turnoConfirmado.medico_id, {
            turnoId: id,
            fecha: fechaAviso,
            hora: horaTurno,
            cuando: "reservado",
          }).catch(() => false)
        );
      }
    }
  }
}

/**
 * Estados que SÍ pueden llegar después de un pago aprobado: son las únicas
 * cosas que le pasan a una plata ya cobrada. Cualquier otro estado sobre una
 * atención aprobada es un webhook viejo llegando tarde.
 */
const POSTERIORES_AL_COBRO = new Set(["refunded", "partially_refunded", "charged_back"]);

/**
 * ¿Este webhook puede tocar el pago de la atención, o llega tarde?
 *
 * Mercado Pago manda DOS webhooks por pago (created + updated) y no garantiza el
 * orden. Estos handlers actualizaban a ciegas (`.eq("id", id)` y nada más), así
 * que había dos formas de arruinar una atención ya cobrada:
 *
 *  1. OTRO pago. El paciente paga en dos intentos: el primero sale rechazado, el
 *     segundo se aprueba. Si el webhook del intento rechazado llega después,
 *     dejaba la consulta apuntando a un pago que no existe, marcada "rechazada",
 *     sobre plata que sí entró.
 *
 *  2. EL MISMO pago, en un estado anterior. Si el webhook "pending" del pago
 *     bueno llega después del "approved", degradaba la consulta a pendiente:
 *     el paciente veía "falta pagar" habiendo pagado.
 *
 * Regla única que cubre las dos: si la atención ya figura cobrada, solo pasan
 * los webhooks del MISMO pago y en un estado posterior al cobro (devolución o
 * contracargo). Todo lo demás se registra y se descarta.
 *
 * `handleApproved` no necesita esto: ya se protege exigiendo el estado previo
 * en el propio UPDATE.
 */
async function puedePisarElPago(
  admin: ReturnType<typeof createAdminClient>,
  table: "consultas" | "turnos",
  id: string,
  paymentId: string,
  nuevoStatus: string,
  logCtx: Record<string, unknown>
): Promise<boolean> {
  const { data, error } = await admin
    .from(table)
    .select("pago_id, mp_status")
    .eq("id", id)
    .maybeSingle();

  // Si no se pudo leer, se deja pasar: perder el registro de un rechazo real es
  // peor que el riesgo de pisar, y esto solo se juega cuando hubo dos intentos.
  if (error || !data) return true;
  if (data.mp_status !== "approved") return true;

  const esElMismoPago = String(data.pago_id ?? "") === String(paymentId);
  if (esElMismoPago && POSTERIORES_AL_COBRO.has(nuevoStatus)) return true;

  logInfo("[WEBHOOK]", "Webhook tardío sobre una atención ya cobrada: se descarta", {
    ...logCtx,
    pago_vigente: data.pago_id,
    pago_del_webhook: paymentId,
    status_del_webhook: nuevoStatus,
    mismo_pago: esElMismoPago,
  });
  return false;
}

async function handleRejected(
  admin: ReturnType<typeof createAdminClient>,
  tipo: "consulta" | "turno",
  id: string,
  paymentId: string,
  statusDetail: string | null,
  logCtx: Record<string, unknown>
): Promise<void> {
  const table = tipo === "consulta" ? "consultas" : "turnos";
  if (!(await puedePisarElPago(admin, table, id, paymentId, "rejected", logCtx))) return;

  await admin
    .from(table)
    .update({ pago_id: paymentId, mp_status: "rejected" })
    .eq("id", id);

  logInfo("[WEBHOOK]", "Pago rechazado", { ...logCtx, statusDetail });
  // El motivo queda en la huella: antes había que preguntárselo a MP pago por pago.
  trackEvent({ evento: "pago_rechazado", pacienteId: null, metadata: { tipo, recursoId: id, paymentId, detalle: statusDetail } });

  // Alarma: un paciente que intentó pagar y no pudo es un proceso que falló
  // (regla de Diego 06/10: alarmas de procesos, no de sucesos). Desde que se
  // paga solo con cuenta de MP un rechazo es raro, así que suena cada uno.
  await sendDoctoAlert(
    "Mercado Pago rechazó un pago",
    [
      "Un paciente intentó pagar y Mercado Pago lo rechazó.",
      `Tipo: ${tipo}`,
      `Atención: ${id}`,
      `Pago MP: ${paymentId}`,
      `Motivo (MP): ${statusDetail ?? "sin motivo informado"}`,
      "Panel: https://www.docto.com.ar/admin/consultas",
    ].join("\n")
  );
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
  // Mismo cuidado que en el rechazo: un `pending` tardío del intento fallido no
  // puede degradar una atención que ya se cobró. Los refunds y contracargos del
  // pago vigente sí pasan, porque hablan de ESE pago.
  if (!(await puedePisarElPago(admin, table, id, paymentId, mpStatus, logCtx))) return;

  await admin
    .from(table)
    .update({ pago_id: paymentId, mp_status: mpStatus })
    .eq("id", id);

  logInfo("[WEBHOOK]", "Status actualizado", { ...logCtx, mpStatus });
  if (mpStatus === "refunded") {
    trackEvent({ evento: "pago_refund", pacienteId: null, metadata: { tipo, recursoId: id, paymentId } });
    await reaccionarADevolucionExterna(admin, tipo, id, paymentId, logCtx);
  }
}

/**
 * Una devolución que NO disparó Docto (29/09/2026, ver lib/video/presencia.ts).
 *
 * El profesional es el cobrador: puede devolver un pago desde su cuenta de
 * Mercado Pago, y lo hace. Hasta hoy Docto solo anotaba `refunded` y seguía
 * como si nada: la atención quedaba "atendida", nadie se enteraba, y el
 * reporte contaba plata que ya había vuelto. Ahora: se marca el reintegro, se
 * avisa al equipo si la atención estaba viva o figuraba hecha, y si figuraba
 * hecha sin que el paciente hubiera entrado a la sala y sin dejar evolución
 * ni documentos, se anula. Al paciente no se le escribe (decisión Diego
 * 30/09: "no vamos a andar con idas y vueltas").
 */
async function reaccionarADevolucionExterna(
  admin: ReturnType<typeof createAdminClient>,
  tipo: "consulta" | "turno",
  id: string,
  paymentId: string,
  logCtx: Record<string, unknown>
): Promise<void> {
  const table = tipo === "consulta" ? "consultas" : "turnos";
  const { data: fila, error: errFila } = await admin
    .from(table)
    .select("estado, reintegro_estado, evolucion")
    .eq("id", id)
    .maybeSingle();
  if (errFila || !fila) {
    logError("[WEBHOOK]", "Devolución: no se pudo leer la atención", { ...logCtx, error: errFila?.message });
    return;
  }
  // Un slot no es una atención: un pago aprobado tarde sobre una reserva vencida
  // y devuelto desde el panel de MP llega con la referencia del slot, y la marca
  // viajaría al próximo paciente que lo reserve. Se loguea y nada más.
  const ESTADOS_SLOT = new Set(["disponible", "reservado_pendiente", "bloqueado", "bloqueado_sin_cobro", "reprogramado"]);
  if (ESTADOS_SLOT.has(fila.estado)) {
    logWarn("[WEBHOOK]", "Devolución sobre un slot sin atención: no se marca nada", { ...logCtx, estado: fila.estado });
    return;
  }

  // 'pendiente' = Docto la intentó (o la reservó) y MP ahora confirma que salió:
  // se cierra acá, sin aviso. Cubre también al profesional sin token de MP, cuya
  // fila queda 'pendiente' hasta que él mismo devuelve desde su cuenta.
  if (fila.reintegro_estado === "pendiente") {
    await admin.from(table).update({ reintegro_estado: "reembolsado" }).eq("id", id).eq("reintegro_estado", "pendiente");
    await admin
      .from("refunds_pendientes")
      .update({ estado: "resuelto", resuelto_at: new Date().toISOString(), ultimo_error: "Mercado Pago informó refunded (webhook)" })
      .eq("tipo", tipo)
      .eq("recurso_id", id)
      .in("estado", ["pendiente", "fee_pendiente", "escalado"]);
    logInfo("[WEBHOOK]", "Reintegro pendiente confirmado por MP", logCtx);
    return;
  }
  // Docto ya le pagó al paciente por CVU (deuda del profesional) y ahora el
  // profesional devuelve desde MP: el paciente cobró dos veces. Nada se toca
  // (la fila y la deuda las mira una persona); se avisa.
  if (fila.reintegro_estado === "cubierto_docto") {
    logWarn("[WEBHOOK]", "Devolución externa sobre un reintegro que Docto ya cubrió: posible doble cobro", logCtx);
    await sendDoctoAlert(
      "[DEVOLUCIÓN] Posible doble cobro: el profesional devolvió un pago que Docto ya había cubierto",
      `Docto ya le había devuelto al paciente por CVU (reintegro cubierto por Docto, con deuda del profesional), ` +
        `y ahora el mismo pago figura devuelto desde la cuenta de Mercado Pago del profesional.\n\n` +
        `Qué significa: el paciente probablemente cobró dos veces, y la deuda del profesional en medicos_deuda ya no corresponde.\n\n` +
        `¿Tenés que hacer algo? Sí: revisar el caso en el admin de reembolsos y la deuda del profesional.\n\n` +
        `———\nDetalle técnico (para Claude): webhook MP refunded sobre reintegro_estado='cubierto_docto'. ` +
        `Tipo: ${tipo} · Id: ${id} · Pago: ${paymentId} · Estado: ${fila.estado}.`
    );
    return;
  }
  // Ya marcada de otra forma: nada que hacer (también cubre el reintento de MP).
  if (fila.reintegro_estado !== null && fila.reintegro_estado !== undefined) return;

  const cerradaComoAtendida = fila.estado === "completado" || fila.estado === "completada";
  let presencia: Awaited<ReturnType<typeof presenciaDelPaciente>> = "sin_datos";
  let hayEvidencia = false;
  if (cerradaComoAtendida) {
    presencia = await presenciaDelPaciente(tipo, id);
    const { count, error: errDocs } = await admin
      .from("documentos")
      .select("id", { count: "exact", head: true })
      .eq(tipo === "turno" ? "turno_id" : "consulta_id", id);
    if (errDocs) logError("[WEBHOOK]", "Devolución: no se pudieron contar los documentos", { ...logCtx, error: errDocs.message });
    // Ante la duda (error al contar) se asume que hay evidencia: no se anula nada.
    hayEvidencia = !!errDocs || (typeof fila.evolucion === "string" && fila.evolucion.trim().length > 0) || (count ?? 0) > 0;
  }
  const decision = decidirReaccionADevolucion({
    estado: fila.estado,
    reintegroEstado: null,
    presencia,
    hayEvidencia,
  });
  if (!decision.externa) return;

  const cambios: Record<string, unknown> = { reintegro_estado: "reembolsado" };
  let estadoNuevo: string | null = null;
  if (decision.anularAtencion) {
    if (tipo === "turno") {
      estadoNuevo = "cancelado_medico";
      cambios.estado = estadoNuevo;
      cambios.motivo_cancelacion =
        "Devolución hecha desde Mercado Pago, fuera de Docto. La atención no se realizó: el paciente nunca entró a la sala.";
    } else {
      estadoNuevo = "cancelada";
      cambios.estado = estadoNuevo;
      cambios.resolucion_motivo = "cancelo_profesional";
      cambios.resuelta_por = "medico";
      cambios.resuelta_at = new Date().toISOString();
    }
  }

  // `reintegro_estado IS NULL` en el UPDATE: si un camino de Docto llega a
  // escribir la fila entre la lectura y acá, no se le pisa nada.
  const { data: tocada, error: errUpdate } = await admin
    .from(table)
    .update(cambios)
    .eq("id", id)
    .is("reintegro_estado", null)
    .select("id")
    .maybeSingle();
  if (errUpdate) {
    logError("[WEBHOOK]", "Devolución externa: error marcando la atención", { ...logCtx, error: errUpdate.message });
    return;
  }
  if (!tocada) {
    logInfo("[WEBHOOK]", "Devolución externa: la fila ya tenía reintegro (carrera con Docto), no se toca", logCtx);
    return;
  }

  logWarn("[WEBHOOK]", "Devolución hecha fuera de Docto", { ...logCtx, estadoAntes: fila.estado, estadoNuevo, avisar: decision.avisar });
  if (!decision.avisar) return;
  await sendDoctoAlert(
    "[DEVOLUCIÓN] Hecha desde Mercado Pago, fuera de Docto",
    `Un profesional devolvió un pago desde su cuenta de Mercado Pago, sin pasar por Docto.\n\n` +
      `Qué significa: el pago volvió al paciente (Mercado Pago ya lo hizo). Docto lo registró como reintegro` +
      (estadoNuevo
        ? ` y anuló la atención, porque figuraba como hecha pero el paciente nunca entró a la sala y no quedó nada escrito.`
        : `. La atención queda en el estado en que estaba (${fila.estado}).`) +
      `\n\n¿Tenés que hacer algo? Mirar el caso en el admin y, si corresponde, hablar con el profesional. ` +
      `Al paciente no se le escribe desde acá.\n\n` +
      `———\nDetalle técnico (para Claude): webhook MP refunded sin reintegro_estado previo. ` +
      `Tipo: ${tipo} · Id: ${id} · Pago: ${paymentId} · Estado antes: ${fila.estado} · Estado después: ${estadoNuevo ?? fila.estado} · Presencia del paciente: ${presencia}.`
  );
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
  // El guard cubre solo el UPDATE, nunca la alerta: un contracargo sobre un pago
  // que NO es el vigente es todavía más raro que uno normal, y de eso hay que
  // enterarse igual. Lo que no corresponde es dejar la atención apuntando a un
  // pago que no es el que se cobró.
  if (await puedePisarElPago(admin, table, id, paymentId, "charged_back", logCtx)) {
    await admin
      .from(table)
      .update({ pago_id: paymentId, mp_status: "charged_back" })
      .eq("id", id);
  }

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
