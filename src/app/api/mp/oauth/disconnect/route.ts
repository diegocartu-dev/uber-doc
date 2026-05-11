import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: medico } = await admin
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!medico) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const ahora = new Date().toISOString();

  await admin
    .from("medicos_mp_accounts")
    .update({
      estado: "revocado",
      desconectado_en: ahora,
      updated_at: ahora,
    })
    .eq("medico_id", medico.id);

  return NextResponse.json({ ok: true });
}
