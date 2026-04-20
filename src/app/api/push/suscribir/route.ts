import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { endpoint, keys, rol } = await req.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Datos de suscripción inválidos" }, { status: 400 });
  }

  const safeRol = rol === "medico" ? "medico" : "paciente";

  const admin = createAdminClient();

  await admin
    .from("push_subscriptions")
    .update({ activa: false })
    .eq("user_id", user.id);

  const { error } = await admin
    .from("push_subscriptions")
    .insert({
      user_id: user.id,
      rol: safeRol,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      activa: true,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
