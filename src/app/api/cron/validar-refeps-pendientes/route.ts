import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarYPersistirRefeps } from "@/lib/refeps/persistir";
import { withCron } from "@/lib/cron-guard";

/**
 * Cron cada 10 min: resuelve la validación REFEPS de médicos pendientes cuya validación
 * automática (waitUntil al registrarse) no llegó a un resultado — típicamente porque el
 * Bus del Ministerio estaba caído/lento. El admin debe encontrarse al médico YA resuelto.
 *
 * Cadencia (decisión Diego 05/07/2026): cada 10 min la PRIMERA hora (auto_intentos < 6),
 * después cada 6 HORAS hasta resolver. Nunca se rinde mientras el médico siga pendiente,
 * nunca martilla de más.
 *
 * Solo reintenta lo NO-definitivo: refeps_data vacío (nunca corrió) o error de SISTEMA
 * (timeout/auth/interno). Un "no figura" real es definitivo y NO se reintenta solo.
 */

export const maxDuration = 60; // validarMedicoREFEPS puede tardar ~51s con retry

const ERRORES_SISTEMA = new Set(["REFEPS_TIMEOUT", "REFEPS_AUTH_ERROR", "REFEPS_ERROR_INTERNO"]);
const INTENTOS_FASE_RAPIDA = 6; // primera hora: cada corrida del cron (10 min)
const ESPACIADO_LENTO_MS = 6 * 60 * 60 * 1000; // después: cada 6 horas
const MAX_POR_CORRIDA = 10;

async function handler(req: Request) {
  // Fail-closed: sin CRON_SECRET configurado, "Bearer undefined" pasaría el check.
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: pendientes, error } = await admin
    .from("medicos")
    .select("id, nombre_completo, dni, refeps_data")
    .eq("estado_registro", "pendiente_revision")
    .eq("es_cuenta_test", false)
    .not("dni", "is", null)
    .neq("refeps_validado", true)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[cron/refeps] query falló:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ahora = Date.now();
  const candidatos = (pendientes ?? []).filter((m) => {
    const rd = (m.refeps_data ?? null) as Record<string, unknown> | null;
    if (!rd) return true; // nunca corrió (waitUntil murió o médico pre-feature)
    const err = typeof rd.error === "string" ? rd.error : null;
    if (!err || !ERRORES_SISTEMA.has(err)) return false; // definitivo (✓/✗ real): no reintentar
    const intentos = typeof rd.auto_intentos === "number" ? rd.auto_intentos : 0;
    if (intentos < INTENTOS_FASE_RAPIDA) return true; // fase rápida: cada corrida
    const ultimo = typeof rd.ultimo_intento_at === "string" ? Date.parse(rd.ultimo_intento_at) : 0;
    return ahora - ultimo >= ESPACIADO_LENTO_MS; // fase lenta: cada 6 h
  }).slice(0, MAX_POR_CORRIDA);

  if (candidatos.length === 0) {
    return NextResponse.json({ ok: true, procesados: 0 });
  }

  const resultados = await Promise.allSettled(
    candidatos.map((m) => validarYPersistirRefeps(m.id))
  );
  const resumen = candidatos.map((m, i) => {
    const r = resultados[i];
    return { medico: m.nombre_completo, resultado: r.status === "fulfilled" ? r.value : `error: ${String(r.reason).slice(0, 120)}` };
  });
  console.log("[cron/refeps]", JSON.stringify(resumen));

  return NextResponse.json({ ok: true, procesados: candidatos.length, resumen });
}

export const GET = withCron("validar-refeps-pendientes", handler);
