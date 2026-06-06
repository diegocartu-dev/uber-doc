import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const consultaId = req.nextUrl.searchParams.get("consultaId");
  if (!consultaId) return NextResponse.json({ error: "Falta consultaId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Determinar rol del usuario
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Filtrar por ownership: paciente_id = auth.uid() o medico_id = medico.id
  // NOTA: `desconectado_at` lo agrega la migración 20260606_resolucion_consultas_fase1.sql.
  // El código que lo selecciona NO debe desplegarse antes de aplicar esa migración
  // (PostgREST falla el SELECT si la columna no existe). Ver regla en CLAUDE.md.
  let query = supabase
    .from("consultas")
    .select("estado, sala_video_url, desconectado_at")
    .eq("id", consultaId);

  if (medico) {
    query = query.eq("medico_id", medico.id);
  } else {
    query = query.eq("paciente_id", user.id);
  }

  const { data } = await query.single();

  if (!data) return NextResponse.json({ error: "No encontrada" }, { status: 403 });
  return NextResponse.json(data);
}
