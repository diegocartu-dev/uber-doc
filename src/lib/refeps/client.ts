import { createHmac } from "crypto";
import type { FHIRBundle, FHIRPractitioner } from "./types";

// ─── Constantes del Bus de Interoperabilidad ────────────────────────────────

const FHIR_BASE_URL = "https://bus.msal.gob.ar/fhir";
const TOKEN_ENDPOINT = "https://bus.msal.gob.ar/bus-auth/v2/auth";

// Identifier systems oficiales de Argentina
// El Bus de Interoperabilidad solo acepta búsqueda por REFEPS ID (no por DNI directo).
// El DNI del médico se usa como valor del identifier REFEPS.
export const IDENTIFIER_SYSTEMS = {
  REFEPS: "https://sisa.msal.gov.ar/REFEPS",
} as const;

// ─── JWT Builder (HS256) ────────────────────────────────────────────────────

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

interface JWTClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  scope: string;
  ident: string;
  name: string;
  role: string;
}

export function buildJWT(claims: JWTClaims, secret: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

// ─── Token cache (in-memory, per-instance en Vercel serverless) ─────────────

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function isTokenValid(): boolean {
  if (!cachedToken) return false;
  // Renovar 60s antes de expiración para evitar races
  return Date.now() < cachedToken.expiresAt - 60_000;
}

// ─── Configuración desde env vars ───────────────────────────────────────────

interface REFEPSConfig {
  systemId: string;
  credentialId: string;
  tokenSecret: string;
  issuer: string;
}

function getConfig(): REFEPSConfig {
  const systemId = process.env.REFEPS_SYSTEM_ID?.trim();
  const credentialId = process.env.REFEPS_CREDENTIAL_ID?.trim();
  const tokenSecret = process.env.REFEPS_TOKEN_SECRET?.trim();

  if (!systemId || !credentialId || !tokenSecret) {
    throw new Error(
      "REFEPS: faltan variables de entorno (REFEPS_SYSTEM_ID, REFEPS_CREDENTIAL_ID, REFEPS_TOKEN_SECRET)"
    );
  }

  return {
    systemId,
    credentialId,
    tokenSecret,
    issuer: "https://docto.com.ar",
  };
}

// ─── Obtener access token ───────────────────────────────────────────────────

export async function obtenerToken(): Promise<string> {
  if (isTokenValid()) {
    return cachedToken!.accessToken;
  }

  const config = getConfig();
  const now = Math.floor(Date.now() / 1000);

  const claims: JWTClaims = {
    iss: config.issuer,
    sub: config.systemId,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 900, // 15 minutos
    scope: "Practitioner/*.read",
    ident: config.credentialId,
    name: "docto",
    role: "user",
  };

  const jwt = buildJWT(claims, config.tokenSecret);

  // El Bus de Interoperabilidad usa JSON body (no form-urlencoded)
  // con campos camelCase (grantType, clientAssertionType, clientAssertion)
  const _tTok = Date.now();
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantType: "client_credentials",
      scope: "Practitioner/*.read",
      clientAssertionType:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      clientAssertion: jwt,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  console.log(`[refeps/token] HTTP ${resp.status} en ${Date.now() - _tTok}ms`);

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(
      `REFEPS token error (${resp.status}): ${body.slice(0, 200)}`
    );
  }

  // El Bus usa camelCase en la respuesta: accessToken, tokenType, expiresIn
  const data = (await resp.json()) as {
    accessToken: string;
    tokenType: string;
    expiresIn: number;
  };

  if (!data.accessToken) {
    throw new Error("REFEPS: respuesta de token sin accessToken");
  }

  cachedToken = {
    accessToken: data.accessToken,
    // expiresIn del Bus viene en milisegundos (180000 = 3 minutos)
    expiresAt: Date.now() + data.expiresIn,
  };

  return data.accessToken;
}

// ─── Invalidar token (para retry en caso de 401) ───────────────────────────

export function invalidarToken(): void {
  cachedToken = null;
}

// ─── Convertir DNI a REFEPS ID ─────────────────────────────────────────────
// El REFEPS ID usa el formato "5410" + DNI (prefijo país Argentina)
const REFEPS_PREFIX = "5410";

export function dniToRefepsId(dni: string): string {
  // Si ya tiene el prefijo, no duplicar
  if (dni.startsWith(REFEPS_PREFIX) && dni.length > 10) {
    return dni;
  }
  return `${REFEPS_PREFIX}${dni}`;
}

// ─── Buscar Practitioner por DNI ────────────────────────────────────────────

// El Bus FHIR del Ministerio es LENTO e intermitente. Timeout generoso + reintentos SOLO
// ante timeout: un timeout no es "no figura", es "no respondió". Presupuesto del PEOR caso
// (token frío + los 2 fetch al Bus hacen timeout): obtenerToken 20s + 2×15s + backoff ≈ 51s,
// dentro del maxDuration=60 de las rutas que lo llaman (admin/medicos, admin/medicos/refeps).
// NO subir estos valores sin subir también maxDuration, o Vercel mata la función y el
// usuario recibe el mismo error opaco que este mecanismo intenta evitar.
const BUS_TIMEOUT_MS = 15_000;
const BUS_MAX_INTENTOS = 2;

function esErrorDeTimeout(err: unknown): boolean {
  const m = err instanceof Error ? err.message + " " + err.name : String(err);
  return m.includes("Timeout") || m.includes("timeout") || m.includes("abort");
}

export async function buscarPorDNI(
  dni: string
): Promise<FHIRPractitioner | null> {
  const refepsId = dniToRefepsId(dni);
  const url = new URL(`${FHIR_BASE_URL}/Practitioner`);
  url.searchParams.set("identifier", `${IDENTIFIER_SYSTEMS.REFEPS}|${refepsId}`);
  url.searchParams.set("_format", "json");

  const pedir = async (token: string): Promise<Response> =>
    fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/fhir+json" },
      signal: AbortSignal.timeout(BUS_TIMEOUT_MS),
    });

  for (let intento = 1; intento <= BUS_MAX_INTENTOS; intento++) {
    try {
      let token = await obtenerToken();
      const _tBus = Date.now();
      let resp = await pedir(token);
      console.log(`[refeps/buscar] intento ${intento}: HTTP ${resp.status} en ${Date.now() - _tBus}ms`);

      // 401 → token vencido: invalidar, renovar y reintentar una vez (no cuenta como intento).
      if (resp.status === 401) {
        invalidarToken();
        token = await obtenerToken();
        resp = await pedir(token);
      }

      if (resp.status === 404) return null; // no encontrado (definitivo — no reintentar)
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`REFEPS Practitioner error (${resp.status}): ${body.slice(0, 200)}`);
      }

      const data = (await resp.json()) as FHIRBundle;
      return data.entry?.[0]?.resource ?? null;
    } catch (err) {
      // Reintentar SOLO ante timeout (el Bus lento). Otros errores se propagan.
      if (!esErrorDeTimeout(err) || intento === BUS_MAX_INTENTOS) throw err;
      console.warn(`[refeps/buscar] timeout en intento ${intento}, reintento…`);
      await new Promise((r) => setTimeout(r, 800 * intento));
    }
  }
  // Inalcanzable (el loop siempre retorna o lanza), pero TS lo exige.
  throw new Error("REFEPS: sin resultado tras reintentos");
}
