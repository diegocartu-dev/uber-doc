// Cliente de la API de recetas de Farmalink (RecetaElectRest v3), 13/10/2026.
//
// Para qué: cada receta de Docto tiene que llevar su CUIR (Res. MS 2214/2025,
// art. 6), y la CUIR la da el repositorio donde se registra la receta. Para
// pacientes particulares ese repositorio es el de Farmalink (Res. MS 5744/2024).
// Estado del trámite y del formato: docs/farmalink-integracion.md.
//
// Hoy apunta SOLO al entorno de prueba (credenciales FARMALINK_TEST_*). Producción
// se agrega cuando Farmalink homologue y entregue sus credenciales.
//
// Como Supabase y Resend: no lanza excepciones; devuelve { ok, ... } y quien
// llama mira el error. La emisión de la receta nunca depende de esta llamada.

const HOST_TEST = "https://test-servicios.farmalink.com.ar";
const SCOPE = "Switch.RecetaElectRest";
// El token dura 12 h (expires_in: 43200, verificado el 11/06/2026); se renueva
// una hora antes para no usarlo justo cuando vence.
const MARGEN_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

export type OperacionReceta = "altaReceta" | "consultaReceta" | "bajaReceta";

export type ErrorFarmalink = {
  /** HTTP de la respuesta, o 0 si no hubo respuesta (red, timeout). */
  status: number;
  /** errorInterno.codigo de Farmalink: "5075" formato inválido, "5009" seguridad… */
  codigo: string | null;
  descripcion: string | null;
  mensaje: string | null;
  /** Para buscar el caso con Farmalink. */
  idTransaccion: string | null;
};

export type RespuestaFarmalink<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; error: ErrorFarmalink };

type Credenciales = { host: string; clientId: string; clientSecret: string; usuario: string; clave: string };

export function credencialesFarmalink(env: NodeJS.ProcessEnv = process.env): Credenciales | null {
  const clientId = env.FARMALINK_TEST_CLIENT_ID;
  const clientSecret = env.FARMALINK_TEST_CLIENT_SECRET;
  const usuario = env.FARMALINK_TEST_USER;
  const clave = env.FARMALINK_TEST_PASSWORD;
  if (!clientId || !clientSecret || !usuario || !clave) return null;
  return { host: (env.FARMALINK_TEST_HOST || HOST_TEST).replace(/\/+$/, ""), clientId, clientSecret, usuario, clave };
}

let tokenEnCache: { valor: string; venceMs: number; clave: string } | null = null;

/** Solo para los tests. */
export function _olvidarToken() {
  tokenEnCache = null;
}

function errorDe(status: number, cuerpo: unknown): ErrorFarmalink {
  const e = (cuerpo as { error?: { idTransaccion?: string; errorInterno?: { codigo?: string; descripcion?: string; mensaje?: string | null } } } | null)?.error;
  return {
    status,
    codigo: e?.errorInterno?.codigo ?? null,
    descripcion: e?.errorInterno?.descripcion ?? null,
    mensaje: e?.errorInterno?.mensaje ?? null,
    idTransaccion: e?.idTransaccion ?? null,
  };
}

async function post(url: string, headers: Record<string, string>, body?: unknown, fetchImpl: typeof fetch = fetch) {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      // El borde de Farmalink (un WAF) rechaza con 403 sin este header, aun sin cuerpo.
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const texto = await res.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }
    return { status: res.status, ok: res.ok, json };
  } catch (err) {
    return { status: 0, ok: false, json: { error: { errorInterno: { descripcion: err instanceof Error ? err.message : String(err) } } } };
  }
}

/**
 * Token OAuth de Farmalink. Todos los parámetros van en HEADERS, `grant_type`
 * en mayúsculas y el path termina en /generate (verificado el 11/06/2026).
 */
export async function tokenFarmalink(
  cred: Credenciales,
  ahoraMs: number = Date.now(),
  fetchImpl: typeof fetch = fetch,
): Promise<RespuestaFarmalink<string>> {
  const claveCache = `${cred.host}|${cred.clientId}|${cred.usuario}`;
  if (tokenEnCache && tokenEnCache.clave === claveCache && tokenEnCache.venceMs - MARGEN_MS > ahoraMs) {
    return { ok: true, status: 200, data: tokenEnCache.valor };
  }
  const r = await post(
    `${cred.host}/api/oauth/token/generate`,
    {
      Authorization: `Basic ${Buffer.from(`${cred.clientId}:${cred.clientSecret}`).toString("base64")}`,
      username: cred.usuario,
      password: cred.clave,
      scope: SCOPE,
      grant_type: "PASSWORD",
    },
    undefined,
    fetchImpl,
  );
  const j = r.json as { access_token?: string; expires_in?: number } | null;
  if (!r.ok || !j?.access_token) return { ok: false, error: errorDe(r.status, r.json) };
  tokenEnCache = { valor: j.access_token, venceMs: ahoraMs + (j.expires_in ?? 3600) * 1000, clave: claveCache };
  return { ok: true, status: r.status, data: j.access_token };
}

/** Llama a una operación de RecetaElectRest v3 con el token vigente. */
export async function operacionReceta<T = unknown>(
  operacion: OperacionReceta,
  cuerpo: unknown,
  opciones: { cred?: Credenciales | null; ahoraMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<RespuestaFarmalink<T>> {
  const cred = opciones.cred === undefined ? credencialesFarmalink() : opciones.cred;
  if (!cred) return { ok: false, error: { status: 0, codigo: null, descripcion: "Farmalink sin credenciales en este entorno", mensaje: null, idTransaccion: null } };
  const token = await tokenFarmalink(cred, opciones.ahoraMs, opciones.fetchImpl);
  if (!token.ok) return token;
  const r = await post(`${cred.host}/api/recetaElect/v3/${operacion}`, { Authorization: `Bearer ${token.data}` }, cuerpo, opciones.fetchImpl);
  if (!r.ok) {
    // Un 401 puede ser un token revocado antes de tiempo: la próxima llamada pide otro.
    if (r.status === 401) _olvidarToken();
    return { ok: false, error: errorDe(r.status, r.json) };
  }
  return { ok: true, status: r.status, data: r.json as T };
}
