import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const medicoId = req.nextUrl.searchParams.get("medicoId");
  if (!medicoId) return NextResponse.json({ error: "Falta medicoId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: esperando } = await supabase
    .from("consultas")
    .select("id, especialidad, estado, created_at, paciente_id, motivo_consulta")
    .eq("medico_id", medicoId)
    .eq("estado", "esperando")
    .order("created_at", { ascending: true });

  if (!esperando) return NextResponse.json([]);

  const pacUserIds = [...new Set(esperando.map((c) => c.paciente_id))];
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

  const result = esperando.map((c) => {
    const p = pacMap.get(c.paciente_id);
    return {
      id: c.id,
      especialidad: c.especialidad,
      estado: c.estado,
      created_at: c.created_at,
      paciente_nombre: p?.nombre ?? "Paciente",
      paciente_tabla_id: p?.id ?? null,
      motivo_consulta: c.motivo_consulta,
      fecha_nacimiento: p?.nacimiento ?? null,
    };
  });

  return NextResponse.json(result);
}
