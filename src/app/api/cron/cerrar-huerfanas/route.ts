import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logInfo, logWarn, logError } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const hace10min = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  let totalCerradas = 0;
  const detalle: { tabla: string; cerradas: number; ids: string[] }[] = [];

  for (const tabla of ["consultas", "turnos"] as const) {
    const { data: huerfanas, error: errSelect } = await supabase
      .from(tabla)
      .select("id")
      .eq("estado", "en_curso")
      .lt("updated_at", hace10min);

    if (errSelect) {
      logError("[CRON/HUERFANAS]", `Error seleccionando ${tabla}`, { error: errSelect.message });
      detalle.push({ tabla, cerradas: 0, ids: [`ERROR: ${errSelect.message}`] });
      continue;
    }

    if (!huerfanas || huerfanas.length === 0) {
      detalle.push({ tabla, cerradas: 0, ids: [] });
      continue;
    }

    const ids = huerfanas.map((h) => h.id);
    const estadoFinal = tabla === "consultas" ? "completada" : "completado";

    const { error: errUpdate } = await supabase
      .from(tabla)
      .update({ estado: estadoFinal })
      .in("id", ids);

    if (errUpdate) {
      logError("[CRON/HUERFANAS]", `Error actualizando ${tabla}`, { error: errUpdate.message, ids });
      detalle.push({ tabla, cerradas: 0, ids: [`ERROR update: ${errUpdate.message}`] });
      continue;
    }

    totalCerradas += ids.length;
    detalle.push({ tabla, cerradas: ids.length, ids });
  }

  const hace45dias = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  const { data: creditosVencidos } = await supabase
    .from("turnos")
    .select("id")
    .eq("estado", "cancelado_medico")
    .eq("reintegro_estado", "pendiente")
    .lt("updated_at", hace45dias);

  let reembolsados = 0;
  if (creditosVencidos && creditosVencidos.length > 0) {
    const ids = creditosVencidos.map((t) => t.id);
    const { error: errReembolso } = await supabase
      .from("turnos")
      .update({ reintegro_estado: "reembolsado" })
      .in("id", ids);

    if (!errReembolso) reembolsados = ids.length;
  }

  // Limpiar mp_oauth_state expirados (tokens de un solo uso, TTL 1 hora)
  const hace1hora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: oauthBorrados, error: errOauth } = await supabase
    .from("mp_oauth_state")
    .delete()
    .lt("created_at", hace1hora)
    .select("id");

  const oauthLimpiados = errOauth ? 0 : (oauthBorrados?.length ?? 0);

  if (errOauth) {
    logError("[CRON/HUERFANAS]", "Error limpiando mp_oauth_state", { error: errOauth.message });
  }

  // Limpiar webhook_failed_attempts viejos (>24h)
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: webhookBorrados, error: errWebhook } = await supabase
    .from("webhook_failed_attempts")
    .delete()
    .lt("first_attempt_at", hace24h)
    .select("ip");

  const webhookLimpiados = errWebhook ? 0 : (webhookBorrados?.length ?? 0);

  if (errWebhook) {
    logError("[CRON/HUERFANAS]", "Error limpiando webhook_failed_attempts", { error: errWebhook.message });
  }

  // Fallback: consultas CI pagadas que el webhook no transicionó a en_curso
  const hace5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: pagadasHuerfanas, error: errPagadas } = await supabase
    .from("consultas")
    .select("id")
    .eq("estado", "pagada")
    .lt("updated_at", hace5min);

  let pagadasRecuperadas = 0;
  if (errPagadas) {
    logError("[CRON/HUERFANAS]", "Error buscando pagadas huérfanas", { error: errPagadas.message });
  } else if (pagadasHuerfanas && pagadasHuerfanas.length > 0) {
    const ids = pagadasHuerfanas.map((c) => c.id);
    const { error: errRecuperar } = await supabase
      .from("consultas")
      .update({ estado: "en_curso", en_curso_at: new Date().toISOString() })
      .in("id", ids);

    if (errRecuperar) {
      logError("[CRON/HUERFANAS]", "Error recuperando pagadas a en_curso", { error: errRecuperar.message, ids });
    } else {
      pagadasRecuperadas = ids.length;
      logWarn("[CRON/HUERFANAS]", "Consultas pagadas recuperadas a en_curso (webhook no las transicionó)", { ids });
    }
  }

  if (totalCerradas > 0 || reembolsados > 0 || oauthLimpiados > 0 || webhookLimpiados > 0 || pagadasRecuperadas > 0) {
    logInfo("[CRON/HUERFANAS]", "Ejecución con cambios", {
      totalCerradas,
      creditosReembolsados: reembolsados,
      oauthStateLimpiados: oauthLimpiados,
      webhookFailedLimpiados: webhookLimpiados,
      pagadasRecuperadas,
      detalle,
    });
  }

  return NextResponse.json({
    ok: true,
    total_cerradas: totalCerradas,
    creditos_reembolsados: reembolsados,
    oauth_state_limpiados: oauthLimpiados,
    webhook_failed_limpiados: webhookLimpiados,
    pagadas_recuperadas: pagadasRecuperadas,
    detalle,
  });
}
