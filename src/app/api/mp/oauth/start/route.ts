import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

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

  const state = randomBytes(32).toString("hex");

  const { error: stateError } = await admin.from("mp_oauth_state").insert({
    state,
    medico_id: medico.id,
  });

  if (stateError) {
    console.error("Error guardando OAuth state");
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }

  const clientId = process.env.MP_CLIENT_ID;
  const redirectUri = process.env.MP_OAUTH_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    console.error("Faltan variables MP_CLIENT_ID o MP_OAUTH_REDIRECT_URI");
    return NextResponse.json(
      { error: "Error de configuración" },
      { status: 500 }
    );
  }

  const authUrl = new URL("https://auth.mercadopago.com/authorization");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("platform_id", "mp");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString(), 302);
}
