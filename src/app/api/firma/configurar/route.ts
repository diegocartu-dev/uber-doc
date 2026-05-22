import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { provisionarClaves, tieneClaves } from "@/lib/firma/claves";

export async function GET() {
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

  const configurado = await tieneClaves(medico.id);
  return NextResponse.json({ configurado });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo")
    .eq("user_id", user.id)
    .single();

  if (!medico) {
    return NextResponse.json({ error: "No es médico" }, { status: 403 });
  }

  try {
    await provisionarClaves(medico.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[firma/configurar] error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json(
      { error: "Error configurando firma electrónica" },
      { status: 500 }
    );
  }
}
