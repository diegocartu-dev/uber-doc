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

  const origin = request.headers.get("origin");
  if (!origin) return true; // header ausente: no se castiga al navegador viejo
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false; // Origin ilegible = no es un navegador nuestro
  }
}
