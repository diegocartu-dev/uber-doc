import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailRecordatorio24h } from "@/lib/email";
import { logInfo, logError } from "@/lib/logger";
import { withCron } from "@/lib/cron-guard";
import { fechaAR } from "@/lib/insights/fechas";

async function handler(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // "Mañana" en hora ARGENTINA. Con la fecha del servidor (UTC) daba bien a la
  // hora agendada (09:00 ART = 12:00 UTC, mismo día), pero corrido a mano
  // después de las 21:00 ART —que es lo que la alerta de este cron le pide a
  // Diego cuando se saltea— ya era el día siguiente en UTC y buscaba los turnos
  // de pasado mañana: la tanda perdida seguía perdida (hallazgo 12/10/2026).
  const fechaManana = fechaAR(-1);

  const { data: turnos, error } = await supabase
    .from("turnos")
    .select("id")
    .eq("fecha", fechaManana)
    .eq("estado", "confirmado")
    .eq("recordatorio_24h_enviado", false);

  if (error) {
    logError("[CRON/RECORDATORIOS]", "Error buscando turnos", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!turnos || turnos.length === 0) {
    return NextResponse.json({ ok: true, enviados: 0, fecha: fechaManana });
  }

  let enviados = 0;
  for (const turno of turnos) {
    await enviarEmailRecordatorio24h(turno.id);

    await supabase
      .from("turnos")
      .update({ recordatorio_24h_enviado: true })
      .eq("id", turno.id);

    enviados++;
  }

  logInfo("[CRON/RECORDATORIOS]", "Recordatorios enviados", { enviados, fecha: fechaManana });
  return NextResponse.json({ ok: true, enviados, fecha: fechaManana });
}

export const GET = withCron("recordatorios", handler);
