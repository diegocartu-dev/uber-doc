import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailConsultaConfirmada } from "@/lib/email/enviar";

export async function POST(req: NextRequest) {
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

    const { error: updateError } = await supabaseAdmin
      .from("consultas")
      .update({ estado: "pagada" })
      .eq("id", consultaId);

    if (updateError) {
      return NextResponse.json({ error: "Error al actualizar estado" }, { status: 500 });
    }

    // Fire and forget — no bloquea la respuesta al cliente
    enviarEmailConsultaConfirmada(consultaId).catch(console.error);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
