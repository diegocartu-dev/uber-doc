import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin";

function fechaAR(offset = 0) {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  d.setDate(d.getDate() - offset);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function GET(req: NextRequest) {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const dias = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("dias") ?? "30", 10) || 30, 1), 365);
  const desde = fechaAR(dias);
  const admin = createAdminClient();

  const [{ data: medicos }, { data: consultas }, { data: turnos }] = await Promise.all([
    admin.from("medicos").select("id, nombre_completo, especialidad, precio_consulta, disponible, verificado, estado_registro").eq("verificado", true),
    admin.from("consultas").select("id, estado, medico_id, paciente_id, canal_origen, created_at, aceptada_at").gte("created_at", desde),
    admin.from("turnos").select("id, estado, medico_id, paciente_id, fecha, updated_at, hora_inicio").gte("fecha", desde),
  ]);

  const stats = (medicos ?? []).map(m => {
    const misConsultas = (consultas ?? []).filter(c => c.medico_id === m.id);
    const misTurnos = (turnos ?? []).filter(t => t.medico_id === m.id);
    const completadas = misConsultas.filter(c => c.estado === "completada").length + misTurnos.filter(t => t.estado === "completado").length;
    const canceladas = misConsultas.filter(c => c.estado === "cancelada").length + misTurnos.filter(t => t.estado === "cancelado").length;
    const noShows = misTurnos.filter(t => t.estado === "no_show").length;
    const gmv = completadas * (m.precio_consulta ?? 0);

    const ciConEspera = misConsultas.filter(c => c.aceptada_at && c.created_at);
    const esperaPromMs = ciConEspera.length > 0
      ? ciConEspera.reduce((s, c) => s + (new Date(c.aceptada_at!).getTime() - new Date(c.created_at).getTime()), 0) / ciConEspera.length
      : null;

    const pacientes = new Set([...misConsultas.map(c => c.paciente_id), ...misTurnos.map(t => t.paciente_id)]);
    const pacientesRepeat = new Map<string, number>();
    for (const c of misConsultas) pacientesRepeat.set(c.paciente_id, (pacientesRepeat.get(c.paciente_id) ?? 0) + 1);
    for (const t of misTurnos) pacientesRepeat.set(t.paciente_id, (pacientesRepeat.get(t.paciente_id) ?? 0) + 1);
    const repiten = [...pacientesRepeat.values()].filter(n => n > 1).length;
    const retencion = pacientes.size > 0 ? Math.round((repiten / pacientes.size) * 100) : 0;

    const ultimaAct = ([...misConsultas, ...misTurnos] as Record<string, string>[])
      .map(x => x.created_at ?? x.fecha)
      .sort()
      .pop() ?? null;

    return {
      id: m.id,
      nombre: m.nombre_completo,
      especialidad: m.especialidad,
      disponible: m.disponible,
      consultas: completadas,
      canceladas,
      noShows,
      gmv,
      comision: gmv * 0.05,
      esperaPromMs,
      retencion,
      ultimaActividad: ultimaAct,
    };
  });

  stats.sort((a, b) => b.gmv - a.gmv);

  return NextResponse.json({ medicos: stats });
}
