// ─── País de la cuenta de Mercado Pago del médico ─────────────────────────────
// Caso real 07/08/2026: un médico conectó una cuenta de Mercado Pago de OTRO PAÍS.
// Desde ese momento TODAS sus preferencias de pago se generaron en la moneda y el
// sitio de ese país, así que ningún paciente argentino podía pagarle (el checkout
// le pedía el importe en moneda extranjera). Nadie se enteró: ni el médico, ni el
// paciente, ni el panel — el médico siguió apareciendo disponible y aceptando
// consultas que nunca se podían cobrar. Se descubrió porque una paciente esperó
// 20 minutos intentando pagar.
//
// La detección es directa: con el token del médico, GET /users/me devuelve
// `site_id`. Argentina = "MLA". Cualquier otro sitio significa que la cuenta cobra
// en otra moneda y en otro checkout.

/** Sitio de Mercado Pago de Argentina. Docto cobra en pesos a pacientes en AR. */
export const MP_SITE_ARGENTINA = "MLA";

/** site_id de Mercado Pago → país en criollo (para mensajes al médico y al admin). */
const PAIS_POR_SITE: Record<string, string> = {
  MLA: "Argentina",
  MLB: "Brasil",
  MLM: "México",
  MLC: "Chile",
  MCO: "Colombia",
  MLU: "Uruguay",
  MPE: "Perú",
  MLV: "Venezuela",
  MBO: "Bolivia",
  MPY: "Paraguay",
  MEC: "Ecuador",
  MCR: "Costa Rica",
  MPA: "Panamá",
  MGT: "Guatemala",
  MRD: "República Dominicana",
  MSV: "El Salvador",
  MHN: "Honduras",
  MNI: "Nicaragua",
  MPT: "Portugal",
};

/**
 * "MLB" → "Brasil". Si el sitio no está en la tabla devolvemos "otro país" para
 * que el mensaje siga siendo entendible (Mercado Pago puede sumar sitios nuevos).
 */
export function paisDeSite(siteId: string | null | undefined): string {
  if (!siteId) return "otro país";
  return PAIS_POR_SITE[siteId.toUpperCase()] ?? "otro país";
}

/** ¿La cuenta es argentina? Solo `true` si lo sabemos con certeza. */
export function esSiteArgentino(siteId: string | null | undefined): boolean {
  return (siteId ?? "").toUpperCase() === MP_SITE_ARGENTINA;
}

/**
 * Resultado del chequeo. Distinguir los tres casos es LO IMPORTANTE: un timeout
 * de la API de Mercado Pago NO es "cuenta extranjera". Solo `extranjera` (la API
 * respondió y el sitio no es MLA) habilita a marcar o rechazar a alguien.
 */
export type ChequeoSite =
  | { estado: "argentina"; siteId: string }
  | { estado: "extranjera"; siteId: string }
  | { estado: "no_verificable"; motivo: string };

/**
 * Consulta GET /users/me con el token del médico y clasifica el país de la cuenta.
 * Nunca lanza: cualquier problema de red, timeout o respuesta rara cae en
 * `no_verificable` con el motivo, para que el llamador decida sin adivinar.
 */
export async function consultarSiteMp(
  accessToken: string,
  timeoutMs = 8_000
): Promise<ChequeoSite> {
  try {
    const resp = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      // 401/403 = token vencido o revocado; 5xx = MP caído. Ninguno dice nada
      // sobre el país de la cuenta.
      return { estado: "no_verificable", motivo: `HTTP ${resp.status}` };
    }
    const data = (await resp.json()) as { site_id?: unknown };
    const siteId = typeof data.site_id === "string" ? data.site_id.toUpperCase() : "";
    if (!siteId) {
      return { estado: "no_verificable", motivo: "respuesta sin site_id" };
    }
    return siteId === MP_SITE_ARGENTINA
      ? { estado: "argentina", siteId }
      : { estado: "extranjera", siteId };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "error de red";
    return { estado: "no_verificable", motivo: motivo.slice(0, 120) };
  }
}
