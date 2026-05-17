import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const admin = createAdminClient();

    // Soft delete — mark as dado_de_baja (Ley 26.529 requires data retention)
    const { error } = await admin
      .from("medicos")
      .update({
        dado_de_baja: true,
        dado_de_baja_at: new Date().toISOString(),
        disponible: false,
      })
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
