import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const { consultaId, turnoId, textoVersion } = body;

  if (!consultaId && !turnoId) {
    return NextResponse.json({ error: "Falta consultaId o turnoId" }, { status: 400 });
  }

  if (consultaId) {
    const { data: consulta } = await supabase
      .from("consultas")
      .select("paciente_id")
      .eq("id", consultaId)
      .single();

    if (!consulta || consulta.paciente_id !== user.id) {
      return NextResponse.json({ error: "Consulta no encontrada" }, { status: 403 });
    }
  }

  if (turnoId) {
    const { data: turno } = await supabase
      .from("turnos")
      .select("paciente_id")
      .eq("id", turnoId)
      .single();

    if (!turno || turno.paciente_id !== user.id) {
      return NextResponse.json({ error: "Turno no encontrado" }, { status: 403 });
    }
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  const { error } = await supabase.from("consentimientos_informados").insert({
    paciente_id: user.id,
    consulta_id: consultaId ?? null,
    turno_id: turnoId ?? null,
    texto_version: textoVersion ?? "v1",
    ip,
    user_agent: userAgent,
  });

  if (error) {
    console.error("[consentimiento] insert error:", error.code, error.message);
    return NextResponse.json({ error: "Error registrando consentimiento" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
