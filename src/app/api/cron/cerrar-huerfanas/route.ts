import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logInfo, logWarn, logError } from "@/lib/logger";
import { sendDoctoAlert } from "@/lib/alertas";
import { withCron } from "@/lib/cron-guard";

async function handler(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const hace10min = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  // Catch-all conservador para consultas (ver comentario en el loop): 4 h.
  const hace4h = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  let totalCerradas = 0;
  // Cualquier error de query hace que la ruta devuelva 500 al final: un cron que
  // falla EN SILENCIO devolviendo 200 es invisible (esta rama de `consultas` vivió
  // ~3 meses muerta filtrando por una columna inexistente sin que saltara nada).
  let huboError = false;
  const detalle: { tabla: string; cerradas: number; ids: string[] }[] = [];

  for (const tabla of ["consultas", "turnos"] as const) {
    // `consultas` NO tiene `updated_at` (usa `en_curso_at`); `turnos` sí. Antes este
    // loop filtraba por `updated_at` en ambas tablas y la rama de consultas fallaba
    // TODAS las corridas (column does not exist) → red muerta ~3 meses. (El bloque
    // de "pagadas huérfanas" de abajo tenía el mismo bug; corregido a `created_at`.)
    //
    // Umbral por tabla, deliberado:
    //  - turnos: `updated_at` (marca de última actividad) + 10 min. Una consulta viva
    //    la refresca, así que no la cerramos.
    //  - consultas: `en_curso_at` es un timestamp FIJO de inicio, sin marca de
    //    actividad → con 10 min echaríamos a un paciente de una CI viva. Usamos 4 h:
    //    catch-all sólo para lo IMPOSIBLE de ser una consulta real en curso. Los
    //    cortes por desconexión los resuelve rejoin-expirar (vía `desconectado_at`).
    const columnaTiempo = tabla === "consultas" ? "en_curso_at" : "updated_at";
    const umbral = tabla === "consultas" ? hace4h : hace10min;
    const { data: huerfanas, error: errSelect } = await supabase
      .from(tabla)
      .select("id")
      .eq("estado", "en_curso")
      .lt(columnaTiempo, umbral);

    if (errSelect) {
      huboError = true;
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
      huboError = true;
      logError("[CRON/HUERFANAS]", `Error actualizando ${tabla}`, { error: errUpdate.message, ids });
      detalle.push({ tabla, cerradas: 0, ids: [`ERROR update: ${errUpdate.message}`] });
      continue;
    }

    totalCerradas += ids.length;
    detalle.push({ tabla, cerradas: ids.length, ids });
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

  // Fallback: consultas CI pagadas que el webhook no transicionó a en_curso.
  // `consultas` NO tiene `updated_at` (este bloque también estuvo roto desde el
  // origen — gate Roberto #259). `created_at` es la única columna de tiempo
  // confiablemente poblada; en CI la consulta se crea segundos antes del pago,
  // así que created_at + 5 min mantiene la semántica de "quedó pagada y no avanzó".
  const hace5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: pagadasHuerfanas, error: errPagadas } = await supabase
    .from("consultas")
    .select("id")
    .eq("estado", "pagada")
    .lt("created_at", hace5min);

  let pagadasRecuperadas = 0;
  if (errPagadas) {
    huboError = true;
    logError("[CRON/HUERFANAS]", "Error buscando pagadas huérfanas", { error: errPagadas.message });
  } else if (pagadasHuerfanas && pagadasHuerfanas.length > 0) {
    const ids = pagadasHuerfanas.map((c) => c.id);
    const { error: errRecuperar } = await supabase
      .from("consultas")
      .update({ estado: "en_curso", en_curso_at: new Date().toISOString() })
      .in("id", ids);

    if (errRecuperar) {
      huboError = true;
      logError("[CRON/HUERFANAS]", "Error recuperando pagadas a en_curso", { error: errRecuperar.message, ids });
    } else {
      pagadasRecuperadas = ids.length;
      logWarn("[CRON/HUERFANAS]", "Consultas pagadas recuperadas a en_curso (webhook no las transicionó)", { ids });
    }
  }

  if (totalCerradas > 0 || oauthLimpiados > 0 || webhookLimpiados > 0 || pagadasRecuperadas > 0) {
    logInfo("[CRON/HUERFANAS]", "Ejecución con cambios", {
      totalCerradas,
      oauthStateLimpiados: oauthLimpiados,
      webhookFailedLimpiados: webhookLimpiados,
      pagadasRecuperadas,
      detalle,
    });
  }

  const payload = {
    ok: !huboError,
    total_cerradas: totalCerradas,
    oauth_state_limpiados: oauthLimpiados,
    webhook_failed_limpiados: webhookLimpiados,
    pagadas_recuperadas: pagadasRecuperadas,
    detalle,
  };

  // Si algo falló, alertar (esta es la red de seguridad de consultas/turnos
  // colgados; si ELLA se rompe queremos enterarnos) y devolver 500 para que la
  // corrida figure FALLIDA en Vercel, no "ok" en silencio.
  if (huboError) {
    await sendDoctoAlert(
      "⚠️ cron cerrar-huerfanas falló",
      `La red de cierre de consultas/turnos huérfanos tuvo errores.\n\n${JSON.stringify(payload, null, 2)}`
    );
    return NextResponse.json(payload, { status: 500 });
  }

  return NextResponse.json(payload);
}

export const GET = withCron("cerrar-huerfanas", handler);
