// src/lib/institucional/origen.ts
// ¿Este POST salió de NUESTRA propia página?
//
// Las dos rutas públicas del paciente institucional (`/acceso/entrar` y
// `/acceso/reenviar/enviar`) reciben un form POST y hacen algo caro o
// sensible SIN depender de cookies previas — esa es justamente la gracia del
// patrón elegido (funciona dentro del webview de WhatsApp, sin sesión). Pero
// eso mismo las deja expuestas a un POST cross-site: `SameSite=lax` no protege
// nada acá porque la ruta no LEE las cookies del visitante, se las ESCRIBE.
//
// El ataque concreto que esto cierra (login-CSRF / session swap): alguien del
// padrón publica una página con un form auto-submit hacia `/acceso/entrar` con
// SU token. Cualquiera que la abra —un profesional en guardia, un operador del
// call center— queda logueado como el atacante, y todo lo que haga después
// ocurre bajo esa identidad y es legible por él con su propio enlace.
//
// La defensa es de dos headers que el navegador pone solo y una página no
// puede falsear:
//   · `Origin` — un form POST de nuestra landing manda el nuestro; uno
//     cross-site manda el del atacante. Si viene y no coincide: 403.
//   · `Sec-Fetch-Site` — refuerzo para navegadores que lo mandan. Solo se
//     rechaza `cross-site`: `same-origin`, `same-site` y `none` pasan.
//
// Los dos son OPCIONALES a propósito (un webview viejo podría no mandarlos):
// ausentes, la petición pasa. Rechazar por header faltante dejaría afuera al
// paciente de un teléfono viejo, que es exactamente a quien hay que dejar entrar.

import type { NextRequest } from "next/server";

export function esPostDelMismoSitio(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  // El navegador AFIRMA que el pedido salió de nuestra propia página (o de una
  // navegación directa). Ese header lo controla el navegador, una página no
  // puede falsearlo: es la atestación más fuerte que tenemos, y alcanza. Sin
  // este return, un `Origin` raro más abajo podía vetar a un navegador que
  // estaba diciendo explícitamente "soy same-origin" — exactamente lo que pasó
  // con Safari en navegación privada la noche previa a la demo (18/08/2026).
  if (site) return true; // same-origin | same-site | none

  const origin = request.headers.get("origin");
  if (!origin) return true; // header ausente: no se castiga al navegador viejo

  // `Origin: null` — la palabra "null", literal — es la serialización del
  // "origen opaco": Safari en navegación privada y varios WebViews la mandan en
  // form POSTs LEGÍTIMOS de la propia página. Acá ya se sabe que no hay
  // `sec-fetch-site` (navegador viejo); rechazar "null" dejaba afuera al
  // paciente del teléfono viejo en modo privado, que es justo a quien esta
  // función promete dejar pasar. Un atacante moderno no llega acá: su navegador
  // manda `sec-fetch-site: cross-site` y cayó en el primer return.
  if (origin === "null") return true;

  // Con qué comparamos el Origin. `request.url` NO sirve solo: detrás del proxy
  // de Vercel el host de esa URL puede ser el del deployment (…-hash.vercel.app)
  // y no el dominio por el que entró la persona — y entonces un POST legítimo
  // de nuestra propia landing se rechaza. El host real llega en los headers que
  // pone el proxy; `request.url` queda como último recurso.
  const hostProxy =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";

  const aceptados = new Set<string>();
  if (hostProxy) aceptados.add(`${proto}://${hostProxy}`);
  try {
    aceptados.add(new URL(request.url).origin);
  } catch {
    /* request.url ilegible: quedan los headers del proxy */
  }

  try {
    return aceptados.has(new URL(origin).origin);
  } catch {
    return false; // Origin ilegible = no es un navegador nuestro
  }
}
