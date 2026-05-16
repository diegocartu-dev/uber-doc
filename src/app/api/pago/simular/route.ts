import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  // Bloquear solo si pagos reales marketplace están activos
  const { getFlag } = await import("@/lib/feature-flags");
  if (await getFlag("pago_marketplace")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { consultaId } = await req.json();
    if (!consultaId) {
      return NextResponse.json({ error: "Falta consultaId" }, { status: 400 });
    }

    // Verificar que el usuario autenticado es el paciente de esta consulta
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    const { data: consulta } = await supabaseAdmin
      .from("consultas")
      .select("id, estado, paciente_id")
      .eq("id", consultaId)
      .eq("paciente_id", user.id)
      .single();

    if (!consulta) {
      return NextResponse.json({ error: "Consulta no encontrada" }, { status: 404 });
    }

    if (consulta.estado !== "aceptada") {
      return NextResponse.json({ error: "Estado no válido para simular pago" }, { status: 400 });
    }

    await supabaseAdmin
      .from("consultas")
      .update({ estado: "pagada" })
      .eq("id", consultaId);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
