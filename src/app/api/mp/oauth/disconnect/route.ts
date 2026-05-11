import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackEvent } from "@/lib/funnel";

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

  const { count } = await admin
    .from("medicos_mp_accounts")
    .update(
      {
        estado: "revocado",
        desconectado_en: ahora,
        updated_at: ahora,
      },
      { count: "exact" }
    )
    .eq("medico_id", medico.id);

  await trackEvent({
    evento: "mp_oauth_disconnect",
    medicoId: medico.id,
    metadata: { tenia_registro: (count ?? 0) > 0 },
  });

  return NextResponse.json({ ok: true });
}
