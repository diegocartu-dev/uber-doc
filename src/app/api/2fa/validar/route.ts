import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validarOTP } from "@/lib/firma/otp";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!medico) {
    return NextResponse.json({ error: "No es médico" }, { status: 403 });
  }

  const body = await req.json();
  const { codigo, consultaId, turnoId } = body;

  if (!codigo || typeof codigo !== "string" || !/^\d{6}$/.test(codigo)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  const result = await validarOTP(medico.id, codigo, consultaId, turnoId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  return NextResponse.json({ ok: true, otp_id: result.otp_id });
}
