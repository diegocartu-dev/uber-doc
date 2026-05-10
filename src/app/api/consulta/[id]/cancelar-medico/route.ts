import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cerrarEntradaSala } from "@/lib/sala-espera";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: consultaId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Verificar que el user es el medico de esta consulta
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!medico) {
    return NextResponse.json({ error: "No es medico" }, { status: 403 });
  }

  // Verificar que la consulta pertenece al medico y esta en estado cancelable
  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, estado")
    .eq("id", consultaId)
    .eq("medico_id", medico.id)
    .in("estado", ["aceptada", "pagada", "en_curso"])
    .maybeSingle();

  if (!consulta) {
    return NextResponse.json(
      { error: "Consulta no encontrada o no cancelable" },
      { status: 404 }
    );
  }

  const { error } = await supabase
    .from("consultas")
    .update({ estado: "cancelada" })
    .eq("id", consultaId)
    .eq("medico_id", medico.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  cerrarEntradaSala({ consultaId, motivo: "cancelado_medico" }).catch(() => {});

  return NextResponse.json({ ok: true });
}
