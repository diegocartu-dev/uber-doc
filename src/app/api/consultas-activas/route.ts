import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const medicoId = req.nextUrl.searchParams.get("medicoId");
  if (!medicoId) return NextResponse.json({ error: "Falta medicoId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: consultas } = await supabase
    .from("consultas")
    .select("id, especialidad, paciente_id, sala_video_url, motivo_consulta, sintomas, created_at, estado")
    .eq("medico_id", medicoId)
    .in("estado", ["aceptada", "en_curso"])
    .order("created_at", { ascending: true });

  if (!consultas || consultas.length === 0) return NextResponse.json([]);

  const pacUserIds = [...new Set(consultas.map((c) => c.paciente_id))];
  let pacMap = new Map<string, { id: string; nombre: string; nacimiento: string | null }>();
  if (pacUserIds.length > 0) {
    const { data: pacs } = await supabase
      .from("pacientes")
      .select("id, user_id, nombre_completo, fecha_nacimiento")
      .in("user_id", pacUserIds);
    pacMap = new Map(
      (pacs ?? []).map((p) => [p.user_id, { id: p.id, nombre: p.nombre_completo, nacimiento: p.fecha_nacimiento }])
    );
  }

  const result = consultas.map((c) => {
    const p = pacMap.get(c.paciente_id);
    return {
      id: c.id,
      especialidad: c.especialidad,
      paciente_nombre: p?.nombre ?? "Paciente",
      paciente_tabla_id: p?.id ?? null,
      sala_video_url: c.sala_video_url,
      motivo_consulta: c.motivo_consulta,
      sintomas: c.sintomas,
      created_at: c.created_at,
      fecha_nacimiento: p?.nacimiento ?? null,
    };
  });

  return NextResponse.json(result);
}
