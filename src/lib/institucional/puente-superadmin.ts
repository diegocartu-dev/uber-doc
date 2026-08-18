// src/lib/institucional/puente-superadmin.ts
// EL PUENTE — entrar a la instancia institucional desde el admin de Docto, sin
// una segunda contraseña.
//
// ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
// La instancia es un proyecto Supabase aparte: su propio padrón de usuarios, su
// propia contraseña. Para el superadmin de Docto —una sola persona, que ya se
// autenticó en docto.com.ar para llegar a `/admin`— eso significaba mantener una
// credencial más, en un sistema que usa dos veces por semana. En la práctica no
// la mantenía: el navegador le ofrecía la de Docto, fallaba, y la única salida
// era pedir un enlace por otro canal. La noche del 17/08/2026 eso frenó un
// ensayo entero.
//
// La decisión de Diego es la correcta y es la simple: **si ya probaste ser el
// admin de Docto, esa prueba alcanza.** El botón vive al final de `/admin` y la
// instancia confía en esa afirmación — pero solo si viene con el secreto
// compartido, y solo para acuñar la sesión de UNA cuenta, la que la instancia
// tiene configurada como su administradora.
//
// ── POR QUÉ EL SECRETO NO VIAJA AL NAVEGADOR ─────────────────────────────────
// El puente es servidor-a-servidor: el `/admin` de Docto llama a la instancia
// desde su backend, con el secreto en un header, y recibe una URL de un solo
// uso. Recién esa URL se le da al navegador. Si el secreto viajara en un link,
// quedaría en el historial, en los logs del proxy y en cualquier captura de
// pantalla de una demo — y sería una llave permanente, no un pasaje.
//
// Tampoco se copia la llave maestra de la instancia al proyecto de Docto: Docto
// no sabe firmar sesiones de la instancia, solo sabe pedirle una. Si el proyecto
// de Docto quedara comprometido, el atacante consigue pedir entradas a la
// instancia (malo) pero no las claves para fabricar cualquier cosa (peor).
//
// ── POR QUÉ SE ACUÑA EN EL SERVIDOR ──────────────────────────────────────────
// Un enlace mágico de Supabase aterriza con el token en el FRAGMENTO de la URL
// (`#access_token=…`), que por definición no llega al servidor. `/auth/callback`
// lee `?code=` —el flujo PKCE, el que usa el cliente del navegador— así que un
// enlace generado desde el panel de administración le llegaba vacío y rebotaba
// al login. Ese es exactamente el síntoma que se vio: "el link no anda".
//
// Acá no hay fragmento: la instancia se queda con el `hashed_token`, lo canjea
// ella misma con `verifyOtp` y escribe la cookie. El navegador nunca ve un
// token de sesión en la URL.

import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";

/** Header por el que viaja el secreto compartido. */
export const HEADER_PUENTE = "x-puente-superadmin";

/** A dónde aterriza el superadmin cuando el puente funciona. */
export const DESTINO_PUENTE = "/admin/demo";

export type ResultadoPuente =
  | { ok: true; url: string }
  | { ok: false; error: string; estado: number };

/**
 * ¿El secreto que llegó es el nuestro?
 *
 * Comparación de largo constante: un `===` sobre strings corta en el primer
 * byte distinto, y ese tiempo es medible. Es paranoia barata sobre un secreto
 * que abre el panel de una provincia.
 */
export function secretoValido(recibido: string | null | undefined): boolean {
  const esperado = process.env.PUENTE_SUPERADMIN_SECRET ?? "";
  // Sin secreto configurado el puente está CERRADO, no abierto: un deploy al
  // que le falta la env var no puede convertirse en una puerta sin llave.
  if (esperado.length < 32) return false;
  if (!recibido || recibido.length !== esperado.length) return false;

  let diferencia = 0;
  for (let i = 0; i < esperado.length; i++) {
    diferencia |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i);
  }
  return diferencia === 0;
}

/**
 * Fabrica el pasaje de un solo uso para el superadmin de la instancia.
 *
 * Devuelve la URL a la que hay que mandar el navegador. El `hashed_token` que
 * lleva es de un solo uso y de vida corta (lo fija Supabase, no nosotros), y no
 * es una sesión: es el derecho a canjear una.
 */
export async function emitirPasajeSuperadmin(baseUrl: string): Promise<ResultadoPuente> {
  if (!esInstitucional()) {
    return { ok: false, error: "El puente solo existe en la instancia institucional.", estado: 404 };
  }

  const email = process.env.INSTANCIA_ADMIN_EMAIL ?? "";
  if (!email) {
    console.error("[puente] INSTANCIA_ADMIN_EMAIL sin configurar: no hay a quién dejar entrar");
    return { ok: false, error: "La instancia no tiene administradora configurada.", estado: 500 };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  // `hashed_token` es lo único que viaja. El `action_link` que también devuelve
  // Supabase NO se usa a propósito: es el que aterriza con fragmento y rebota.
  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken) {
    console.error("[puente] No se pudo generar el pasaje:", error?.message);
    return { ok: false, error: "No se pudo abrir la sesión en la instancia.", estado: 502 };
  }

  const url = new URL("/superadmin/entrar", baseUrl);
  url.searchParams.set("th", hashedToken);
  return { ok: true, url: url.toString() };
}
