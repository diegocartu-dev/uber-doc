// Qué correos de la Bandeja son "ruido" y no deberían ocupar la vista principal.
//
// ── POR QUÉ (pedido Diego, 18/09/2026) ───────────────────────────────────────
// Todo el inbound del dominio cae en la Bandeja. Entre los mails de gente real
// que pide ayuda se cuelan avisos de LinkedIn, altas de servicios externos y las
// cuentas de prueba. Diego no los quiere ver ahí. No se borran: se pliegan al
// fondo, en la sección "Otros", que el buscador igual encuentra.
//
// Ruido = todo lo que NO es una persona escribiéndonos para que le contestemos:
//   1. Automáticos nuestros o de terceros (`sistema` = true): códigos, rebotes.
//   2. Notificaciones de LinkedIn (cualquier subdominio).
//   3. Altas/avisos de servicios que usaron una dirección de Docto para
//      registrarse (hoy: cargaconsorcios).
//   4. Las cuentas de prueba (medico.test / paciente.testN @docto.com.ar).
//
// La lista de dominios es a mano y a propósito: cada uno se agregó porque
// ensució la Bandeja, no por una regla que pueda barrer un mail real. Sumar uno
// nuevo es una línea.

/** Dominios cuyos mails son siempre ruido. `endsWith` cubre subdominios (em.linkedin.com). */
const DOMINIOS_RUIDO = ["linkedin.com", "cargaconsorcios.com.ar"] as const;

/** Cuentas de prueba: local-part medico.test o paciente.test(N) en el dominio propio. */
const CUENTA_PRUEBA = /^(medico|paciente)\.test\d*@docto\.com\.ar$/i;

/** Saca la dirección de un campo `de`/`para` que puede venir como "Nombre <mail@dom>". */
export function direccionDeCorreo(campo: string | null | undefined): string {
  const crudo = String(campo ?? "");
  const entre = crudo.match(/<([^<>]+)>/);
  const cand = (entre ? entre[1] : crudo).trim().toLowerCase();
  const m = cand.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/);
  return m ? m[0] : "";
}

function dominioDe(direccion: string): string {
  const i = direccion.lastIndexOf("@");
  return i === -1 ? "" : direccion.slice(i + 1);
}

/**
 * ¿Este correo entrante es ruido (se pliega en "Otros")?
 * Solo aplica a los ENTRANTES: lo que sale de la Bandeja nunca es ruido.
 */
export function esRuidoBandeja(params: { de: string; sistema?: boolean }): boolean {
  if (params.sistema) return true;
  const dir = direccionDeCorreo(params.de);
  if (!dir) return false;
  if (CUENTA_PRUEBA.test(dir)) return true;
  const dom = dominioDe(dir);
  return DOMINIOS_RUIDO.some((d) => dom === d || dom.endsWith("." + d));
}
