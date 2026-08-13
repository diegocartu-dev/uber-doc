import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDoctoAlert } from "@/lib/alertas";
import { CRONS_META, horaArgentina } from "@/lib/crons-meta";

// ─── Guard + heartbeat de crons ───────────────────────────────────────────────
// Nacido de la auditoría de fallas silenciosas (13/07/2026): ningún cron avisaba
// al fallar, y si Vercel dejaba de invocar uno no se emitía NI UN log — el punto
// ciego exacto del incidente Didit (webhook 307, 3 semanas sin enterarnos).
//
// `withCron(key, handler)` envuelve cada route de cron y garantiza:
//   1. Auth fail-closed ÚNICA: sin CRON_SECRET configurado → 500 (antes, 10 de 13
//      crons quedaban ABIERTOS a cualquiera si la env var quedaba vacía).
//   2. Heartbeat: cada corrida se registra en `cron_runs` (tabla solo-service-role).
//      El cron guardián (/api/cron/watchdog) alerta si un cron DEJÓ de reportar —
//      única forma de detectar "Vercel ya no lo invoca".
//   3. Alerta por mail (sendDoctoAlert) ante excepción no capturada o HTTP ≥ 500.
//
// El heartbeat y la alerta NUNCA rompen el cron (best-effort, try/catch propio).

type CronHandler = (req: NextRequest) => Promise<Response>;

async function latido(key: string, ok: boolean, error?: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    // ¿Este cron estaba en alerta? Hay que mirarlo ANTES de pisar la fila:
    // es el único momento en que se ve la transición caído→ok, y ahí va el
    // mail verde de recuperación (pedido Diego 18/07: cerrar el ciclo del
    // mail rojo explícitamente, no por ausencia de más mails).
    let estabaAlertado = false;
    if (ok) {
      const { data: prev } = await admin
        .from("cron_runs")
        .select("last_alerted_at")
        .eq("cron_key", key)
        .maybeSingle();
      estabaAlertado = Boolean(prev?.last_alerted_at);
    }

    await admin.from("cron_runs").upsert({
      cron_key: key,
      last_run_at: now,
      // Recuperarse LIMPIA el throttle de alertas (gate Roberto #260, 2ª vuelta):
      // sin esto, una falla NUEVA dentro de las 6 h posteriores a un incidente ya
      // resuelto quedaba silenciada — la primera alerta de un incidente nuevo
      // debe salir siempre.
      ...(ok ? { last_ok_at: now, last_alerted_at: null } : {}),
      last_status: ok ? "ok" : "error",
      last_error: ok ? null : (error ?? "error").slice(0, 500),
      updated_at: now,
    });

    if (ok && estabaAlertado) {
      const meta = CRONS_META[key];
      const nombre = meta?.nombre ?? `Tarea "${key}"`;
      await sendDoctoAlert(
        `✅ Tarea recuperada: ${nombre}`,
        `${nombre} volvió a correr bien (${horaArgentina()} hs). No tenés que hacer nada.\n\n———\nDetalle técnico (para Claude): cron ${key}, corrida OK registrada tras alerta previa.`
      );
    }
  } catch {
    // El heartbeat jamás debe tirar el cron que vigila.
  }
}

// Alerta con throttle de 6 h por cron (gate Roberto #260 O2): un cron de 10 min
// persistentemente roto serían ~144 mails/día — la fatiga de alertas es el modo
// de falla que enterró el incidente Didit. Comparte `last_alerted_at` con el
// watchdog sin conflicto: si el cron corre-y-falla hay latido (el watchdog no
// alerta); si no corre, withCron no ejecuta (solo alerta el watchdog).
const ANTI_SPAM_MS = 6 * 60 * 60 * 1000;

async function alertarCron(key: string, subject: string, text: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: filas, error } = await admin
      .from("cron_runs")
      .select("cron_key, last_alerted_at, last_status")
      .in("cron_key", [key, "uptime-estado"]);

    // Anti-tormenta (incidente 30/07: base caída → el throttle no se podía leer
    // → un mail rojo POR CRON cada corrida). Si el estado no se puede leer, la
    // causa es una caída general: el monitor de uptime es la ÚNICA voz (alerta
    // sin depender de la base) y los crons individuales se callan.
    if (error) return;
    const general = filas?.find((f) => f.cron_key === "uptime-estado");
    if (general?.last_status === "down") return;

    const data = filas?.find((f) => f.cron_key === key);
    if (
      data?.last_alerted_at &&
      Date.now() - Date.parse(data.last_alerted_at) < ANTI_SPAM_MS
    ) {
      return;
    }
    await sendDoctoAlert(subject, text);
    await admin
      .from("cron_runs")
      .update({ last_alerted_at: new Date().toISOString() })
      .eq("cron_key", key);
  } catch {
    // Best-effort: la alerta jamás debe tirar el cron.
  }
}

/**
 * El "por qué" que el propio cron devolvió, para que el mail lo diga.
 *
 * Sin esto, `alertarCron` armaba el texto SOLO con `CRONS_META[key]` y con
 * `HTTP ${status}`: nunca leía el body. Varios crons contestan el 500 con el
 * detalle que hace falta para actuar —el cierre mensual, con qué mes falló y
 * cuántos encuentros lo bloquean— y ese dato quedaba únicamente en
 * `console.error` de Vercel, mientras el mail decía "devolvió HTTP 500" y nada
 * más.
 *
 * `res.clone()` es obligatorio: el body es un stream de un solo uso y la
 * respuesta original todavía tiene que salir hacia Vercel. Best-effort y
 * acotado: si no se puede leer, el mail sale igual que antes.
 */
async function detalleDelCuerpo(res: Response): Promise<string> {
  try {
    if (!(res.headers.get("content-type") ?? "").includes("json")) return "";
    const cuerpo: unknown = await res.clone().json();
    if (cuerpo === null || typeof cuerpo !== "object") return "";
    return JSON.stringify(cuerpo).slice(0, 600);
  } catch {
    return "";
  }
}

export function withCron(key: string, handler: CronHandler): CronHandler {
  return async (req: NextRequest): Promise<Response> => {
    // Fail-closed: sin CRON_SECRET, "Bearer undefined" pasaría cualquier check.
    if (!process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: "CRON_SECRET no configurado" },
        { status: 500 }
      );
    }
    if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    try {
      const res = await handler(req);
      await latido(key, res.status < 500, `HTTP ${res.status}`);
      if (res.status >= 500) {
        const meta = CRONS_META[key];
        const nombre = meta?.nombre ?? `Tarea "${key}"`;
        const cuerpo = await detalleDelCuerpo(res);
        await alertarCron(
          key,
          `🔴 Tarea automática fallando: ${nombre}`,
          `${nombre} intentó correr pero terminó con error.\n${meta ? `Qué hace: ${meta.queHace}.\nImpacto mientras falle: ${meta.impacto}.` : ""}\n\n¿Tenés que hacer algo? Sí: una tarea que corre y falla no suele arreglarse sola. Abrí Claude Code y decime: "investigá el cron ${key}". Si igual se recupera sola, te llega un mail verde "✅ Tarea recuperada" y no hace falta nada.\n\n———\nDetalle técnico (para Claude): cron ${key} devolvió HTTP ${res.status}.${cuerpo ? `\nRespuesta: ${cuerpo}` : ""}\nRevisar logs en Vercel.`
        );
      }
      return res;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      await latido(key, false, msg);
      const meta = CRONS_META[key];
      const nombre = meta?.nombre ?? `Tarea "${key}"`;
      await alertarCron(
        key,
        `🔴 Tarea automática fallando: ${nombre}`,
        `${nombre} intentó correr pero se rompió a mitad de camino.\n${meta ? `Qué hace: ${meta.queHace}.\nImpacto mientras falle: ${meta.impacto}.` : ""}\n\n¿Tenés que hacer algo? Sí: una tarea que corre y falla no suele arreglarse sola. Abrí Claude Code y decime: "investigá el cron ${key}". Si igual se recupera sola, te llega un mail verde "✅ Tarea recuperada" y no hace falta nada.\n\n———\nDetalle técnico (para Claude): excepción no capturada en el cron ${key}: ${msg}`
      );
      return NextResponse.json({ error: "cron error" }, { status: 500 });
    }
  };
}
