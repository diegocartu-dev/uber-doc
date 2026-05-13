import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailRecordatorio24h } from "@/lib/email";
import { logInfo, logError } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const fechaManana = manana.toISOString().slice(0, 10);

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
