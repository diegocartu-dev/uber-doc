import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/mp-crypto";
import { trackEvent } from "@/lib/funnel";
import { logInfo, logError, logWarn } from "@/lib/logger";
import { sanitizeMpError } from "@/lib/mp-error-sanitizer";
import { sendDoctoAlert } from "@/lib/alertas";

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
    logError("[OAUTH]", "Faltan variables MP para token exchange");
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
        // NOTE: test_token deliberately omitted.
        // With test_token:true, MP returns a token that acts as the APP OWNER
        // (user 28443305), not the authorizing seller. This breaks sandbox
        // marketplace because the collector ends up being a real user.
        // Without it, the token authenticates as the actual authorizing user,
        // which is correct for both production and sandbox.
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
      let errBody: unknown = null;
      try { errBody = await tokenRes.json(); } catch { errBody = { raw: "non-json response" }; }
      logError("[OAUTH]", "MP token exchange falló", { ...sanitizeMpError(tokenRes.status, errBody), medicoId });
      await trackEvent({ evento: "mp_oauth_callback_error", medicoId: medicoId, metadata: { sub_tipo: "token_exchange_failed" } });
      return NextResponse.redirect(
        new URL(`${PERFIL_BASE}&error=token_exchange_failed`, req.url)
      );
    }

    tokenData = await tokenRes.json();
  } catch {
    logError("[OAUTH]", "Error de red en token exchange");
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
    logError("[OAUTH]", "Error encriptando tokens");
    await trackEvent({ evento: "mp_oauth_callback_error", medicoId, metadata: { sub_tipo: "encryption_failed" } });
    return NextResponse.redirect(
      new URL(`${PERFIL_BASE}&error=token_exchange_failed`, req.url)
    );
  }

  const expectedLiveMode = (process.env.VERCEL_ENV ?? process.env.NODE_ENV) === "production";
  if (tokenData.live_mode !== expectedLiveMode) {
    const truncatedToken = tokenData.access_token.slice(0, 8) + "…";
    logWarn("[OAUTH]", "live_mode mismatch — OAuth rechazado", {
      medicoId,
      mp_user_id: String(tokenData.user_id),
      received_live_mode: tokenData.live_mode,
      expected_live_mode: expectedLiveMode,
      token_prefix: truncatedToken,
    });

    await sendDoctoAlert(
      "ALERTA: OAuth MP rechazado por live_mode inconsistente",
      `Un médico intentó conectar su cuenta de Mercado Pago pero el live_mode no coincide con el entorno.\n\nMédico ID: ${medicoId}\nMP User ID: ${tokenData.user_id}\nlive_mode recibido: ${tokenData.live_mode}\nEntorno esperado: ${expectedLiveMode ? "production (live_mode=true)" : "development (live_mode=false)"}\nToken (primeros 8 chars): ${truncatedToken}\nTimestamp: ${new Date().toISOString()}\n\nEl OAuth fue rechazado automáticamente. No se guardó ningún token.`
    );

    await trackEvent({
      evento: "mp_oauth_callback_error",
      medicoId,
      metadata: { sub_tipo: "live_mode_mismatch", received: tokenData.live_mode, expected: expectedLiveMode },
    });

    return NextResponse.redirect(
      new URL(`${PERFIL_BASE}&error=credentials_mismatch`, req.url)
    );
  }

  const { data: existing } = await admin
    .from("medicos_mp_accounts")
    .select("medico_id")
    .eq("mp_user_id", String(tokenData.user_id))
    .maybeSingle();

  if (existing && existing.medico_id !== medicoId) {
    logError("[OAUTH]", "Cuenta MP ya vinculada a otro médico", { mp_user_id: String(tokenData.user_id) });
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
    logError("[OAUTH]", "Error guardando cuenta MP", { medicoId });
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
