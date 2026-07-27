import { NextResponse } from "next/server";
import { withCron } from "@/lib/cron-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDoctoAlert } from "@/lib/alertas";

// ─── Monitor de disponibilidad del sitio ─────────────────────────────────────
// Nacido del 504 MIDDLEWARE_INVOCATION_TIMEOUT del 27/07 14:01 ART: un usuario
// real (Diego) vio el sitio caído y ninguna alarma sonó — el watchdog vigila
// crons, no la disponibilidad pública.
//
// Corre CADA MINUTO y golpea las URLs públicas reales (pasan por el edge y el
// middleware — el mismo camino que un paciente). Falla = reintento a los 3 s;
// si el reintento también falla → 🔴 mail (throttle 30 min) y 🟢 al recuperarse.
//
// Punto ciego asumido: corre en el MISMO Vercel que el sitio. Cubre roturas de
// la app (middleware colgado, deploy roto, Supabase caído). Una caída total de
// Vercel voltea también este cron — ahí la señal es el silencio del watchdog.
// Monitoreo 100% externo = servicio aparte (decisión futura, no hoy).

const URLS = [
  "https://www.docto.com.ar/",
  "https://www.docto.com.ar/api/consulta-estado", // runtime de funciones (400 sin params = vivo)
];
const TIMEOUT_MS = 15_000;
const THROTTLE_ROJO_MS = 30 * 60 * 1000;
// Fila de estado propia en cron_runs (fuera de ESPERADOS del watchdog, como
// hacen las alertas de saldo). El heartbeat de ESTE cron es aparte ("uptime").
const KEY_ESTADO = "uptime-estado";

const horaAR = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" })
    : "?";

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

export const GET = withCron("uptime", async () => {
  let resultados = await Promise.all(URLS.map(probe));

  // Reintento único de las que fallaron: un blip de 1 request no es una caída.
  if (resultados.some((r) => !r.ok)) {
    await new Promise((r) => setTimeout(r, 3000));
    resultados = await Promise.all(
      resultados.map(async (r) => (r.ok ? r : probe(r.url)))
    );
  }

  const caido = resultados.some((r) => !r.ok);
  const detalle = resultados.map((r) => `${r.ok ? "✓" : "✗"} ${r.url} — ${r.detalle}`).join("\n");

  const admin = createAdminClient();
  const { data: prev } = await admin
    .from("cron_runs")
    .select("last_status, last_ok_at, last_alerted_at")
    .eq("cron_key", KEY_ESTADO)
    .maybeSingle();
  const ahora = new Date().toISOString();

  if (caido) {
    const debeAlertar =
      !prev?.last_alerted_at || Date.now() - Date.parse(prev.last_alerted_at) >= THROTTLE_ROJO_MS;
    if (debeAlertar) {
      await sendDoctoAlert(
        "🔴 Docto NO responde — el sitio está caído",
        [
          "QUÉ PASA: el sitio no responde a este monitor (probado 2 veces con 3 segundos de diferencia).",
          `Último momento OK: ${horaAR(prev?.last_ok_at)} ART.`,
          "",
          "IMPACTO: pacientes y médicos no pueden usar Docto ahora mismo.",
          "",
          "QUÉ HACER VOS: probá abrir docto.com.ar en tu teléfono. Ande o no ande, avisale a Claude con la hora — este monitor reintenta cada minuto y te manda el mail verde solo cuando vuelva.",
          "",
          "DETALLE TÉCNICO:",
          detalle,
        ].join("\n")
      );
    }
    await admin.from("cron_runs").upsert({
      cron_key: KEY_ESTADO,
      last_run_at: ahora,
      last_status: "down",
      ...(debeAlertar ? { last_alerted_at: ahora } : {}),
      updated_at: ahora,
    });
    return NextResponse.json({ ok: false, caido: true, resultados });
  }

  // Sitio OK: si veníamos de caída ALERTADA, cerrar el ciclo con el verde.
  if (prev?.last_status === "down" && prev?.last_alerted_at) {
    const minCaido = prev.last_ok_at
      ? Math.max(1, Math.round((Date.now() - Date.parse(prev.last_ok_at)) / 60000))
      : null;
    await sendDoctoAlert(
      "🟢 Docto volvió — el sitio responde de nuevo",
      [
        `QUÉ PASÓ: el sitio estuvo sin responder${minCaido ? ` aproximadamente ${minCaido} minutos` : ""} y ya se recuperó solo.`,
        "",
        "QUÉ HACER VOS: nada. Si se vuelve a caer, llega otro mail rojo.",
        "Si querés que Claude investigue la causa, avisale con la hora del rojo.",
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
  return NextResponse.json({ ok: true, resultados });
});
