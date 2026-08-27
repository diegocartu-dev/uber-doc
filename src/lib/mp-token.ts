import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/mp-crypto";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { sanitizeMpError } from "@/lib/mp-error-sanitizer";

// ─── Token de cobros de Mercado Pago: vigencia y renovación ──────────────────
//
// POR QUÉ EXISTE ESTE ARCHIVO
// El alta de OAuth guardaba `refresh_token_encrypted` y NADIE lo leía: no había
// un solo `grant_type: "refresh_token"` en el repo. La tabla ya venía preparada
// para renovar (`ultima_renovacion`, y un índice sobre `expires_at` filtrado por
// `estado='activo'`), pero la renovación nunca se escribió.
//
// El resultado era un apagón silencioso de la oferta: el token vencía, nada lo
// renovaba, y `estado` recién pasaba a 'expirado' DENTRO del checkout — o sea,
// cuando un paciente ya había pedido la consulta y estaba por pagar. Hasta ese
// momento la fila seguía diciendo 'activo', así que el gate de disponibilidad
// (que mira `estado` y no `expires_at`) dejaba al profesional publicarse y
// aceptar consultas que después nadie podía pagar. Ni el profesional ni el
// panel se enteraban.
//
// UNA RENOVACIÓN FALLIDA NO ES LO MISMO QUE UNA RECHAZADA
// Un timeout o un 5xx de Mercado Pago son transitorios: NO tocan el estado, o
// un hipo de su API apagaría los cobros de gente sana (el mismo criterio que ya
// usa el cron de verificación de país). Solo un rechazo explícito de MP (4xx:
// autorización revocada o refresh inválido) marca la cuenta, porque ahí sí hace
// falta que el profesional vuelva a conectar.

const MP_TOKEN_URL = "https://api.mercadopago.com/oauth/token";
const TIMEOUT_MS = 10_000;

/** Se renueva ANTES de vencer: un token que expira en horas no llega al próximo pago. */
export const MARGEN_RENOVACION_MS = 7 * 24 * 60 * 60 * 1000;

export type MotivoSinToken =
  | "sin_cuenta"
  | "revocado"
  | "refresh_rechazado"
  | "error_red"
  | "config"
  | "cripto";

export type ResultadoToken =
  | { ok: true; accessToken: string; renovado: boolean }
  | { ok: false; motivo: MotivoSinToken };

/**
 * Devuelve un access token de MP utilizable para `medicoId`, renovándolo contra
 * Mercado Pago si ya venció o si le queda menos que `margenMs`.
 *
 * No lanza: todo camino de error vuelve como `{ ok: false, motivo }` para que
 * quien llama decida el status HTTP. El único efecto sobre la base es persistir
 * la renovación (o marcar la cuenta cuando MP la rechaza explícitamente).
 */
export async function asegurarTokenMp(
  medicoId: string,
  margenMs: number = MARGEN_RENOVACION_MS
): Promise<ResultadoToken> {
  const admin = createAdminClient();

  const { data: cuenta } = await admin
    .from("medicos_mp_accounts")
    .select("access_token_encrypted, refresh_token_encrypted, expires_at, estado")
    .eq("medico_id", medicoId)
    .maybeSingle();

  if (!cuenta) return { ok: false, motivo: "sin_cuenta" };

  // Revocado = el profesional sacó la autorización desde Mercado Pago. El
  // refresh no puede resucitarla; tiene que volver a conectar.
  if (cuenta.estado === "revocado") return { ok: false, motivo: "revocado" };

  const venceEn = new Date(cuenta.expires_at).getTime();
  if (Number.isFinite(venceEn) && venceEn - Date.now() > margenMs) {
    try {
      return { ok: true, accessToken: decrypt(cuenta.access_token_encrypted), renovado: false };
    } catch {
      logError("[MP-TOKEN]", "Error desencriptando access token", { medicoId });
      return { ok: false, motivo: "cripto" };
    }
  }

  return renovar(medicoId, cuenta.refresh_token_encrypted);
}

async function renovar(medicoId: string, refreshEnc: string): Promise<ResultadoToken> {
  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    logError("[MP-TOKEN]", "Faltan MP_CLIENT_ID / MP_CLIENT_SECRET", { medicoId });
    return { ok: false, motivo: "config" };
  }

  let refreshToken: string;
  try {
    refreshToken = decrypt(refreshEnc);
  } catch {
    logError("[MP-TOKEN]", "Error desencriptando refresh token", { medicoId });
    return { ok: false, motivo: "cripto" };
  }

  let res: Response;
  try {
    res = await fetch(MP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
  } catch (err) {
    // Timeout o red caída: transitorio. No se toca el estado.
    logWarn("[MP-TOKEN]", "Red caída renovando token", {
      medicoId,
      detalle: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, motivo: "error_red" };
  }

  if (!res.ok) {
    let cuerpo: unknown = null;
    try { cuerpo = await res.json(); } catch { cuerpo = { raw: "non-json response" }; }

    // 5xx = problema de ellos, se reintenta después sin marcar a nadie.
    if (res.status >= 500) {
      logWarn("[MP-TOKEN]", "MP 5xx renovando token", { medicoId, ...sanitizeMpError(res.status, cuerpo) });
      return { ok: false, motivo: "error_red" };
    }

    // 4xx = rechazo explícito... salvo que otro proceso se nos haya adelantado.
    //
    // MP **rota** el refresh token en cada renovación: si dos pagos del mismo
    // profesional entran a la vez —o uno se cruza con el cron— el segundo llega
    // con un refresh ya rotado y MP lo rechaza. Marcar la cuenta ahí apagaría
    // los cobros de alguien SANO, causando justo el problema que este archivo
    // vino a arreglar. Antes de marcar, se relee: si la fila quedó con un token
    // vigente, la renovación la hizo el otro y esto es una carrera, no una falla.
    const admin = createAdminClient();
    const { data: recheck } = await admin
      .from("medicos_mp_accounts")
      .select("access_token_encrypted, expires_at")
      .eq("medico_id", medicoId)
      .maybeSingle();

    if (recheck && new Date(recheck.expires_at).getTime() > Date.now()) {
      logInfo("[MP-TOKEN]", "Renovación en carrera: otro proceso ya renovó", { medicoId });
      try {
        return { ok: true, accessToken: decrypt(recheck.access_token_encrypted), renovado: false };
      } catch {
        return { ok: false, motivo: "cripto" };
      }
    }

    logError("[MP-TOKEN]", "MP rechazó la renovación", { medicoId, ...sanitizeMpError(res.status, cuerpo) });
    await admin
      .from("medicos_mp_accounts")
      .update({ estado: "expirado", desconectado_en: new Date().toISOString() })
      .eq("medico_id", medicoId);
    return { ok: false, motivo: "refresh_rechazado" };
  }

  let datos: { access_token?: string; refresh_token?: string; expires_in?: number };
  try {
    datos = (await res.json()) as typeof datos;
  } catch {
    return { ok: false, motivo: "error_red" };
  }

  if (!datos.access_token || !datos.refresh_token || !datos.expires_in) {
    logError("[MP-TOKEN]", "Respuesta de renovación incompleta", { medicoId });
    return { ok: false, motivo: "error_red" };
  }

  // MP ROTA el refresh token: si se guarda el viejo, la próxima renovación falla.
  const { error } = await createAdminClient()
    .from("medicos_mp_accounts")
    .update({
      access_token_encrypted: encrypt(datos.access_token),
      refresh_token_encrypted: encrypt(datos.refresh_token),
      expires_at: new Date(Date.now() + datos.expires_in * 1000).toISOString(),
      ultima_renovacion: new Date().toISOString(),
      estado: "activo",
      desconectado_en: null,
      updated_at: new Date().toISOString(),
    })
    .eq("medico_id", medicoId);

  if (error) {
    // El token nuevo es válido pero no quedó guardado: usarlo ahora y NO
    // afirmar que la cuenta está renovada. La próxima llamada reintenta.
    logError("[MP-TOKEN]", "No se pudo persistir la renovación", { medicoId, detalle: error.message });
    return { ok: true, accessToken: datos.access_token, renovado: false };
  }

  logInfo("[MP-TOKEN]", "Token renovado", { medicoId });
  return { ok: true, accessToken: datos.access_token, renovado: true };
}
