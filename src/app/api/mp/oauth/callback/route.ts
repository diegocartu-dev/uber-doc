import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/mp-crypto";
import { trackEvent } from "@/lib/funnel";

const PERFIL_BASE = "/medico/perfil?tab=cobros";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code || !state) {
    await trackEvent({ evento: "mp_oauth_callback_error", metadata: { sub_tipo: "invalid_state" } });
    return NextResponse.redirect(
      new URL(`${PERFIL_BASE}&error=invalid_state`, req.url)
    );
  }

  const admin = createAdminClient();

  const { data: stateRow } = await admin
    .from("mp_oauth_state")
    .select("medico_id, expires_at")
    .eq("state", state)
    .single();

  if (!stateRow || new Date(stateRow.expires_at) < new Date()) {
    if (stateRow) {
      await admin.from("mp_oauth_state").delete().eq("state", state);
    }
    await trackEvent({ evento: "mp_oauth_callback_error", medicoId: stateRow?.medico_id ?? null, metadata: { sub_tipo: "invalid_state" } });
    return NextResponse.redirect(
      new URL(`${PERFIL_BASE}&error=invalid_state`, req.url)
    );
  }

  const medicoId = stateRow.medico_id;

  await admin.from("mp_oauth_state").delete().eq("state", state);

  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  const redirectUri = process.env.MP_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    console.error("Faltan variables MP para token exchange");
    await trackEvent({ evento: "mp_oauth_callback_error", medicoId: medicoId, metadata: { sub_tipo: "missing_env_vars" } });
    return NextResponse.redirect(
      new URL(`${PERFIL_BASE}&error=token_exchange_failed`, req.url)
    );
  }

  let tokenData: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    user_id: number;
    public_key: string;
    live_mode: boolean;
  };

  try {
    const tokenRes = await fetch(
      "https://api.mercadopago.com/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      }
    );

    if (!tokenRes.ok) {
      console.error("MP token exchange falló:", tokenRes.status);
      await trackEvent({ evento: "mp_oauth_callback_error", medicoId: medicoId, metadata: { sub_tipo: "token_exchange_failed" } });
      return NextResponse.redirect(
        new URL(`${PERFIL_BASE}&error=token_exchange_failed`, req.url)
      );
    }

    tokenData = await tokenRes.json();
  } catch {
    console.error("Error de red en token exchange");
    await trackEvent({ evento: "mp_oauth_callback_error", medicoId, metadata: { sub_tipo: "token_exchange_failed" } });
    return NextResponse.redirect(
      new URL(`${PERFIL_BASE}&error=token_exchange_failed`, req.url)
    );
  }

  const expiresAt = new Date(
    Date.now() + tokenData.expires_in * 1000
  ).toISOString();

  let accessTokenEnc: string;
  let refreshTokenEnc: string;

  try {
    accessTokenEnc = encrypt(tokenData.access_token);
    refreshTokenEnc = encrypt(tokenData.refresh_token);
  } catch {
    console.error("Error encriptando tokens");
    await trackEvent({ evento: "mp_oauth_callback_error", medicoId, metadata: { sub_tipo: "encryption_failed" } });
    return NextResponse.redirect(
      new URL(`${PERFIL_BASE}&error=token_exchange_failed`, req.url)
    );
  }

  const { data: existing } = await admin
    .from("medicos_mp_accounts")
    .select("medico_id")
    .eq("mp_user_id", String(tokenData.user_id))
    .maybeSingle();

  if (existing && existing.medico_id !== medicoId) {
    console.error("Cuenta MP ya vinculada a otro médico");
    await trackEvent({ evento: "mp_oauth_callback_error", medicoId, metadata: { sub_tipo: "mp_account_already_linked", mp_user_id: String(tokenData.user_id) } });
    return NextResponse.redirect(
      new URL(`${PERFIL_BASE}&error=mp_account_already_linked`, req.url)
    );
  }

  const { error: upsertError } = await admin
    .from("medicos_mp_accounts")
    .upsert(
      {
        medico_id: medicoId,
        mp_user_id: String(tokenData.user_id),
        access_token_encrypted: accessTokenEnc,
        refresh_token_encrypted: refreshTokenEnc,
        expires_at: expiresAt,
        scope: tokenData.scope,
        public_key: tokenData.public_key,
        live_mode: tokenData.live_mode,
        conectado_en: new Date().toISOString(),
        ultima_renovacion: null,
        desconectado_en: null,
        estado: "activo",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "medico_id" }
    );

  if (upsertError) {
    console.error("Error guardando cuenta MP");
    await trackEvent({ evento: "mp_oauth_callback_error", medicoId, metadata: { sub_tipo: "upsert_failed" } });
    return NextResponse.redirect(
      new URL(`${PERFIL_BASE}&error=token_exchange_failed`, req.url)
    );
  }

  await trackEvent({ evento: "mp_oauth_callback_success", medicoId, metadata: { mp_user_id: String(tokenData.user_id), scope: tokenData.scope } });

  return NextResponse.redirect(
    new URL(`${PERFIL_BASE}&success=connected`, req.url)
  );
}
