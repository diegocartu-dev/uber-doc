import { NextResponse } from "next/server";
import { sendDoctoAlertThrottled } from "@/lib/alertas";
import { withCron } from "@/lib/cron-guard";
import { esInstitucional } from "@/lib/instancia";

/**
 * Cron diario (09:00 AR): vigila el SALDO de los servicios prepagos que Docto
 * consume. Nacido del caso 20/07: Didit se quedó sin créditos (white label
 * convirtió las sesiones gratis en pagas) y nadie se enteró hasta que Diego
 * chocó con el error probando — "es fastidioso chocarse con esto
 * silenciosamente". Ningún saldo puede volver a agotarse sin aviso previo.
 *
 * Vigila:
 * - Didit (verificación de identidad): GET /v3/billing/balance/ — sin créditos,
 *   ningún médico puede verificarse (y con el gate encendido, los nuevos no
 *   aparecen en la clínica).
 * - Twilio (WhatsApp al médico): Balance API — sin saldo, mueren los avisos de
 *   paciente esperando (caso Verónica/Romina).
 *
 * Umbrales por env con default US$5 (SALDO_MIN_DIDIT_USD / SALDO_MIN_TWILIO_USD).
 * Alertas con throttle de 20 h (cron diario → un mail por día como mucho, y el
 * mail de recuperación no aplica: el saldo no "vuelve" solo).
 */

export const maxDuration = 30;

const UMBRAL_DIDIT = Number(process.env.SALDO_MIN_DIDIT_USD ?? "5");
const UMBRAL_TWILIO = Number(process.env.SALDO_MIN_TWILIO_USD ?? "5");

type ChequeoSaldo =
  | { servicio: string; ok: true; saldo: number }
  | { servicio: string; ok: false; error: string };

async function saldoDidit(): Promise<ChequeoSaldo> {
  const apiKey = process.env.DIDIT_API_KEY?.trim();
  if (!apiKey) return { servicio: "didit", ok: false, error: "sin DIDIT_API_KEY" };
  try {
    const resp = await fetch("https://verification.didit.me/v3/billing/balance/", {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      return { servicio: "didit", ok: false, error: `HTTP ${resp.status}` };
    }
    const data = (await resp.json()) as Record<string, unknown>;
    // Shape defensivo: el campo puede llamarse balance / credits / amount…
    const saldo = ["balance", "balance_in_dollars", "credits", "amount"]
      .map((k) => Number(data[k]))
      .find((n) => Number.isFinite(n));
    if (saldo === undefined) {
      return { servicio: "didit", ok: false, error: `shape desconocido: ${JSON.stringify(data).slice(0, 120)}` };
    }
    return { servicio: "didit", ok: true, saldo };
  } catch (e) {
    return { servicio: "didit", ok: false, error: e instanceof Error ? e.message : "error" };
  }
}

async function saldoTwilio(): Promise<ChequeoSaldo> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return { servicio: "twilio", ok: false, error: "sin credenciales Twilio" };
  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!resp.ok) {
      return { servicio: "twilio", ok: false, error: `HTTP ${resp.status}` };
    }
    const data = (await resp.json()) as { balance?: string; currency?: string };
    const saldo = Number(data.balance);
    if (!Number.isFinite(saldo)) {
      return { servicio: "twilio", ok: false, error: "balance no numérico" };
    }
    return { servicio: "twilio", ok: true, saldo };
  } catch (e) {
    return { servicio: "twilio", ok: false, error: e instanceof Error ? e.message : "error" };
  }
}

async function handler() {
  // Modo institucional: no aplica (Capa C) — los saldos de servicios prepagos
  // los vigila el deploy B2C; duplicar la vigilancia duplicaría las alertas.
  if (esInstitucional()) {
    console.log("[saldo-servicios] modo institucional: no aplica");
    return NextResponse.json({ ok: true, mensaje: "modo institucional: no aplica" });
  }

  const [didit, twilio] = await Promise.all([saldoDidit(), saldoTwilio()]);

  if (didit.ok && didit.saldo < UMBRAL_DIDIT) {
    await sendDoctoAlertThrottled(
      "svc-saldo-didit",
      20,
      `🟠 Saldo de Didit bajo: US$ ${didit.saldo.toFixed(2)}`,
      `El saldo de Didit (verificación de identidad de médicos) está en US$ ${didit.saldo.toFixed(2)} — por debajo del umbral de US$ ${UMBRAL_DIDIT}.\n\nImpacto si llega a cero: ningún médico puede verificar su identidad (y con el gate encendido, los nuevos no aparecen en la clínica hasta verificarse). Cada verificación cuesta ~US$ 0,33.\n\n¿Tenés que hacer algo? Sí, cuando puedas hoy: https://business.didit.me → "Recargar saldo" (con US$ 50 alcanza para ~150 verificaciones; los créditos no vencen).\n\n———\nDetalle técnico (para Claude): cron saldo-servicios, GET /v3/billing/balance/.`
    );
  }
  if (twilio.ok && twilio.saldo < UMBRAL_TWILIO) {
    await sendDoctoAlertThrottled(
      "svc-saldo-twilio",
      20,
      `🟠 Saldo de Twilio bajo: US$ ${twilio.saldo.toFixed(2)}`,
      `El saldo de Twilio (WhatsApp de aviso a médicos) está en US$ ${twilio.saldo.toFixed(2)} — por debajo del umbral de US$ ${UMBRAL_TWILIO}.\n\nImpacto si llega a cero: dejan de salir los WhatsApp de "paciente esperando" y "aceptá la consulta" (el canal que rescatamos el 17/07 — caso Verónica/Romina). El número también cuesta ~US$ 1,15/mes.\n\n¿Tenés que hacer algo? Sí, cuando puedas hoy: console.twilio.com → Billing → recargar.\n\n———\nDetalle técnico (para Claude): cron saldo-servicios, Twilio Balance API.`
    );
  }
  // Fallas de CONSULTA de saldo (API caída, key inválida) → alerta también, con
  // throttle más largo: no saber el saldo es casi tan malo como saldo bajo.
  for (const c of [didit, twilio]) {
    if (!c.ok) {
      await sendDoctoAlertThrottled(
        `svc-saldo-${c.servicio}-error`,
        20,
        `🟡 No pude consultar el saldo de ${c.servicio}`,
        `El chequeo diario de saldos no pudo leer el saldo de ${c.servicio} (${c.error}).\n\n¿Tenés que hacer algo? No urgente — pero si este mail se repite varios días, decile a Claude: "investigá el cron saldo-servicios".`
      );
    }
  }

  console.log("[cron/saldo-servicios]", JSON.stringify({ didit, twilio }));
  return NextResponse.json({ ok: true, didit, twilio });
}

export const GET = withCron("saldo-servicios", handler);
