import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getHoyAR(): string {
  const ar = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  return `${ar.getFullYear()}-${(ar.getMonth() + 1).toString().padStart(2, "0")}-${ar.getDate().toString().padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const medicoId = req.nextUrl.searchParams.get("medicoId");
  if (!medicoId) return NextResponse.json({ error: "Falta medicoId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: medico } = await supabase
    .from("medicos").select("id").eq("user_id", user.id).single();
  if (!medico || medico.id !== medicoId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const hoy = getHoyAR();
  const { data } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, paciente_id")
    .eq("medico_id", medicoId)
    .gte("fecha", hoy)
    .eq("estado", "en_espera")
    .order("hora_inicio", { ascending: true });

  if (!data) return NextResponse.json([]);

  const pacIds = [...new Set(data.map((t) => t.paciente_id).filter(Boolean))];
  let nombres = new Map<string, string>();
  if (pacIds.length > 0) {
    const { data: pacs } = await supabase
      .from("pacientes")
      .select("id, nombre_completo")
      .in("id", pacIds);
    nombres = new Map((pacs ?? []).map((p) => [p.id, p.nombre_completo]));
  }

  const result = data.map((t) => ({
    id: t.id,
    fecha: t.fecha,
    hora_inicio: t.hora_inicio.slice(0, 5),
    paciente_nombre: nombres.get(t.paciente_id) ?? "Paciente",
    paciente_tabla_id: t.paciente_id,
  }));

  return NextResponse.json(result);
}
