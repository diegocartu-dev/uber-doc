import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushAlPaciente } from "@/lib/push";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: medico } = await supabase
    .from("medicos").select("id").eq("user_id", user.id).single();
  if (!medico) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { pacienteId, consultaId } = await req.json();
  if (!pacienteId) return NextResponse.json({ error: "Falta pacienteId" }, { status: 400 });

  pushAlPaciente(pacienteId, {
    title: "✅ Docto",
    body: "Tus documentos de la consulta ya están disponibles.",
    url: consultaId ? `/mis-consultas` : "/dashboard",
    tag: `docs-${consultaId ?? "general"}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
