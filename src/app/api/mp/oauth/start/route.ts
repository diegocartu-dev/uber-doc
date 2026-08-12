import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";
import { assertNoInstitucional } from "@/lib/instancia";

export async function GET(request: Request) {
  // Modo institucional: sin Mercado Pago — este endpoint no existe (Capa B).
  if (!assertNoInstitucional()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // `origin=onboarding` (lo manda solo el wizard) hace que el callback vuelva al
  // wizard. Sin el param (todo el flujo actual desde /medico/perfil) el state
  // queda plano y el callback vuelve a /medico/perfil como siempre.
  const origin = new URL(request.url).searchParams.get("origin");
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

  // El sufijo `.onb` viaja en el state (round-trip del OAuth) y le dice al
  // callback que vuelva al wizard. No afecta la validación (se busca el state completo).
  const state = randomBytes(32).toString("hex") + (origin === "onboarding" ? ".onb" : "");

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
