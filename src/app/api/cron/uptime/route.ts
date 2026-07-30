import { NextResponse } from "next/server";
import { withCron } from "@/lib/cron-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDoctoAlert } from "@/lib/alertas";

// ─── Monitor de disponibilidad + auto-remediación ────────────────────────────
// v1 (28/07): nace del 504 del 27/07 — golpea las URLs públicas cada minuto.
// v2 (30/07, tras la caída de Supabase de ~28 min): ese incidente fue INVISIBLE
// para la v1 (las URLs respondían rápido; lo muerto era la BASE). Cambios:
//   1. SONDA DE BASE real: un SELECT liviano con timeout — si la base no
//      contesta, es caída aunque la portada cargue.
//   2. AUTO-REINICIO (pedido Diego: "¿y si no estoy con la compu?"): si la
//      base no responde y el control plane de Supabase la cree sana (la firma
//      exacta de una instancia colgada, como hoy), dispara el restart del
//      proyecto vía Management API. Frenos: doble verificación contra el
//      health de Supabase, solo con status ACTIVE_HEALTHY, y como máximo un
//      intento cada 5 minutos (minuto % 5).
//   3. Alertas resistentes a base caída: si no puede leer su estado en la DB,
//      alerta igual con un freno sin-estado (minuto % 15) para no spamear.
// La supresión de la tormenta de alertas por-cron vive en cron-guard (mira
// esta misma fila uptime-estado o la imposibilidad de leerla).

const URLS = [
  "https://www.docto.com.ar/",
  "https://www.docto.com.ar/api/consulta-estado", // runtime de funciones (400 sin params = vivo)
];
const TIMEOUT_MS = 15_000;
const DB_TIMEOUT_MS = 8_000;
const THROTTLE_ROJO_MS = 30 * 60 * 1000;
const KEY_ESTADO = "uptime-estado";
const SUPABASE_REF = "irpupskopjahbqqvckue";

const horaAR = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" })
    : "?";

const minutoActual = () => Math.floor(Date.now() / 60_000);

async function probe(url: string): Promise<{ url: string; ok: boolean; detalle: string }> {
  const inicio = Date.now();
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    // 4xx = la app RESPONDE (auth, params faltantes): vivo. 5xx = caído.
    const ok = res.status < 500;
    return { url, ok, detalle: `HTTP ${res.status} en ${Date.now() - inicio}ms` };
  } catch (e) {
    return { url, ok: false, detalle: `sin respuesta (${e instanceof Error ? e.name : "error"}) tras ${Date.now() - inicio}ms` };
  }
}

// Sonda de base: SELECT liviano con timeout duro. supabase-js no expone abort
// por query → carrera contra un timer.
async function probeDb(): Promise<{ ok: boolean; detalle: string }> {
  const inicio = Date.now();
  try {
    const admin = createAdminClient();
    const q = admin.from("medicos").select("id").limit(1).then(({ error }) => {
      if (error) throw new Error(error.message);
    });
    await Promise.race([
      q,
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), DB_TIMEOUT_MS)),
    ]);
    return { ok: true, detalle: `base OK en ${Date.now() - inicio}ms` };
  } catch (e) {
    return { ok: false, detalle: `base sin respuesta (${e instanceof Error ? e.message : "error"}) tras ${Date.now() - inicio}ms` };
  }
}

// ── Auto-reinicio de la instancia colgada (firma del incidente 30/07) ──
// Devuelve una línea para el mail, o null si no correspondía intentar.
async function intentarAutoReinicio(): Promise<string | null> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) return null;
  // Freno sin estado: como máximo un intento cada 5 minutos.
  if (minutoActual() % 5 !== 0) return null;
  try {
    const auth = { Authorization: `Bearer ${token}` };
    const [salud, proyecto] = await Promise.all([
      fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/health?services=db`, { headers: auth, signal: AbortSignal.timeout(10_000) }).then((r) => r.json()),
      fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}`, { headers: auth, signal: AbortSignal.timeout(10_000) }).then((r) => r.json()),
    ]);
    const dbUnhealthy = Array.isArray(salud) && salud.some((s) => s.name === "db" && !s.healthy);
    const status = proyecto?.status as string | undefined;
    if (status !== "ACTIVE_HEALTHY") {
      // Ya está reiniciando / pausado / en mantenimiento: no tocar.
      return `Supabase reporta status ${status ?? "?"} — no se reinicia (esperando que termine).`;
    }
    if (!dbUnhealthy) {
      // El control plane la ve sana y la sonda falló: puede ser blip de red; no reiniciar.
      return null;
    }
    const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/restart`, {
      method: "POST",
      headers: auth,
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok
      ? "🔁 AUTO-REINICIO DISPARADO: la base estaba colgada (control plane la creía sana) y el monitor la reinició solo. Vuelve en 1-2 minutos."
      : `Intento de auto-reinicio falló: HTTP ${res.status}.`;
  } catch (e) {
    return `Intento de auto-reinicio falló: ${e instanceof Error ? e.message : "error"}.`;
  }
}

export const GET = withCron("uptime", async () => {
  let resultados = await Promise.all(URLS.map(probe));
  if (resultados.some((r) => !r.ok)) {
    await new Promise((r) => setTimeout(r, 3000));
    resultados = await Promise.all(resultados.map(async (r) => (r.ok ? r : probe(r.url))));
  }
  let db = await probeDb();
  if (!db.ok) {
    await new Promise((r) => setTimeout(r, 3000));
    db = await probeDb();
  }

  const caidoWeb = resultados.some((r) => !r.ok);
  const caido = caidoWeb || !db.ok;
  const detalle = [...resultados.map((r) => `${r.ok ? "✓" : "✗"} ${r.url} — ${r.detalle}`), `${db.ok ? "✓" : "✗"} ${db.detalle}`].join("\n");

  const admin = createAdminClient();
  // Leer estado previo puede fallar si la base está caída: en ese caso prev
  // queda null y el throttle pasa a ser sin-estado (minuto % 15).
  let prev: { last_status: string | null; last_ok_at: string | null; last_alerted_at: string | null } | null = null;
  let dbEstadoLegible = false;
  try {
    const { data, error } = await admin
      .from("cron_runs")
      .select("last_status, last_ok_at, last_alerted_at")
      .eq("cron_key", KEY_ESTADO)
      .maybeSingle();
    if (!error) {
      prev = data;
      dbEstadoLegible = true;
    }
  } catch {
    // base caída: seguimos sin estado
  }
  const ahora = new Date().toISOString();

  if (caido) {
    const autoReinicio = !db.ok ? await intentarAutoReinicio() : null;

    const debeAlertar = dbEstadoLegible
      ? !prev?.last_alerted_at || Date.now() - Date.parse(prev.last_alerted_at) >= THROTTLE_ROJO_MS
      : minutoActual() % 15 === 0; // sin estado (base caída): máx. 4 mails/hora
    if (debeAlertar || autoReinicio?.startsWith("🔁")) {
      await sendDoctoAlert(
        !db.ok ? "🔴 Docto caído — la BASE DE DATOS no responde" : "🔴 Docto NO responde — el sitio está caído",
        [
          !db.ok
            ? "QUÉ PASA: la base de datos no contesta. El sitio puede 'abrir' pero cualquier pantalla que cargue datos se cuelga."
            : "QUÉ PASA: el sitio no responde a este monitor (probado 2 veces).",
          `Último momento OK: ${horaAR(prev?.last_ok_at)} ART.`,
          "",
          "IMPACTO: pacientes y médicos no pueden operar con normalidad.",
          "",
          ...(autoReinicio ? [autoReinicio, ""] : []),
          "QUÉ HACER VOS: nada por ahora — el monitor reintenta cada minuto" +
            (autoReinicio?.startsWith("🔁") ? " y ya disparó el reinicio automático" : "") +
            ". Si en 10 minutos no llega el mail verde, abrí Claude y decile: \"investigá la caída\".",
          "",
          "DETALLE TÉCNICO:",
          detalle,
        ].join("\n")
      );
    }
    if (dbEstadoLegible) {
      await admin.from("cron_runs").upsert({
        cron_key: KEY_ESTADO,
        last_run_at: ahora,
        last_status: "down",
        ...(debeAlertar ? { last_alerted_at: ahora } : {}),
        updated_at: ahora,
      }).then(() => {}, () => {});
    }
    return NextResponse.json({ ok: false, caido: true, db: db.ok, resultados });
  }

  // Sitio y base OK: si veníamos de caída ALERTADA, cerrar el ciclo con el verde.
  if (prev?.last_status === "down" && prev?.last_alerted_at) {
    const minCaido = prev.last_ok_at
      ? Math.max(1, Math.round((Date.now() - Date.parse(prev.last_ok_at)) / 60000))
      : null;
    await sendDoctoAlert(
      "🟢 Docto volvió — sitio y base respondiendo",
      [
        `QUÉ PASÓ: hubo una caída${minCaido ? ` de aproximadamente ${minCaido} minutos` : ""} y ya se recuperó.`,
        "",
        "QUÉ HACER VOS: nada. Si se vuelve a caer, llega otro mail rojo.",
      ].join("\n")
    );
  }
  await admin.from("cron_runs").upsert({
    cron_key: KEY_ESTADO,
    last_run_at: ahora,
    last_ok_at: ahora,
    last_status: "ok",
    last_alerted_at: null,
    updated_at: ahora,
  });
  return NextResponse.json({ ok: true, resultados, db: db.detalle });
});
