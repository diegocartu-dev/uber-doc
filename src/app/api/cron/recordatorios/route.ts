import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailRecordatorio24h } from "@/lib/email";

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
    console.error("[cron/recordatorios] error al buscar turnos:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!turnos || turnos.length === 0) {
    console.log("[cron/recordatorios] sin turnos para mañana", fechaManana);
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

  console.log(`[cron/recordatorios] ${enviados} recordatorios enviados para ${fechaManana}`);
  return NextResponse.json({ ok: true, enviados, fecha: fechaManana });
}
