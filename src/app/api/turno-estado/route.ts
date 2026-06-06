import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const turnoId = req.nextUrl.searchParams.get("turnoId");
  if (!turnoId) return NextResponse.json({ error: "Falta turnoId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // NOTA: `desconectado_at` lo agrega la migración 20260606_resolucion_consultas_fase1.sql.
  // No desplegar este SELECT antes de aplicar la migración. Ver regla en CLAUDE.md.
  let query = supabase
    .from("turnos")
    .select("estado, sala_video_url, desconectado_at")
    .eq("id", turnoId);

  if (medico) {
    query = query.eq("medico_id", medico.id);
  } else {
    const { data: paciente } = await supabase
      .from("pacientes").select("id").eq("user_id", user.id).maybeSingle();
    if (!paciente) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    query = query.eq("paciente_id", paciente.id);
  }

  const { data } = await query.single();

  if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 403 });
  return NextResponse.json(data);
}
