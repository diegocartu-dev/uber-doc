import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushAlPaciente } from "@/lib/push";
import { formatNombreMedico } from "@/lib/utils/texto";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const ahora = new Date();
  const en10min = new Date(ahora.getTime() + 10 * 60 * 1000);

  const hoyStr = `${ahora.getFullYear()}-${(ahora.getMonth() + 1).toString().padStart(2, "0")}-${ahora.getDate().toString().padStart(2, "0")}`;
  const horaDesde = `${ahora.getHours().toString().padStart(2, "0")}:${ahora.getMinutes().toString().padStart(2, "0")}`;
  const horaHasta = `${en10min.getHours().toString().padStart(2, "0")}:${en10min.getMinutes().toString().padStart(2, "0")}`;

  const { data: turnos } = await supabase
    .from("turnos")
    .select("id, hora_inicio, paciente_id, medico_id")
    .eq("fecha", hoyStr)
    .eq("estado", "confirmado")
    .gte("hora_inicio", horaDesde)
    .lte("hora_inicio", horaHasta);

  if (!turnos || turnos.length === 0) {
    return NextResponse.json({ ok: true, enviados: 0 });
  }

  const medicoIds = [...new Set(turnos.map((t) => t.medico_id))];
  const { data: medicos } = await supabase
    .from("medicos").select("id, nombre_completo").in("id", medicoIds);
  const medicoMap = new Map((medicos ?? []).map((m) => [m.id, m.nombre_completo]));

  let enviados = 0;
  for (const turno of turnos) {
    if (!turno.paciente_id) continue;
    const nombreMedico = medicoMap.get(turno.medico_id) ?? "tu médico";
    const sent = await pushAlPaciente(turno.paciente_id, {
      title: "🟡 Docto",
      body: `Tu consulta con ${formatNombreMedico(nombreMedico)} empieza en 10 minutos.`,
      url: `/turno/${turno.id}/espera`,
      tag: `recordatorio-${turno.id}`,
    });
    if (sent) enviados++;
  }

  return NextResponse.json({ ok: true, enviados });
}
