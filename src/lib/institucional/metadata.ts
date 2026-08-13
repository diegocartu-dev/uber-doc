// src/lib/institucional/metadata.ts
// El <title>, la descripción y el noindex de las pantallas del paciente.
//
// ── POR QUÉ ESTO EXISTE ──────────────────────────────────────────────────────
// Sin `metadata` propia, una página hereda la del root layout, que es la del
// B2C: "Docto — Consultas médicas online al instante | Telemedicina Argentina"
// y "Consultá con un médico por videollamada en minutos…". Eso es exactamente
// lo que el bot de preview de WhatsApp levanta y lo que la persona ve en su
// chat, DEBAJO del mensaje de la institución (mock 02 §1) — y lo que queda en
// la pestaña del navegador durante toda la sesión.
//
// O sea: la primera pantalla de un producto en MARCA BLANCA anunciaba la marca
// de Docto, con copy de marketplace que en el modelo institucional además es
// falso (acá nadie elige médico ni consulta "en minutos"). La regla es la
// inversa: la institución adelante, Docto al pie.
//
// El `noindex` viene en el mismo paquete porque desde la Etapa 3 `/acceso` está
// FUERA del matcher del middleware, así que ya no hay dónde ponerle el header
// `X-Robots-Tag` por esa vía. Son URLs públicas que muestran nombre de paciente
// y de profesional: no pueden terminar en un buscador.
//
// ⚠ PENDIENTE Etapa 5: el favicon sigue siendo el de Docto (`/favicon.svg` del
// root layout). Cambiarlo necesita el bucket `institucion-assets`, que llega
// con el logo — cuando exista, se suma `icons` acá.

import type { Metadata } from "next";
import { esInstitucional } from "@/lib/instancia";
import { getConfigInstitucion } from "@/lib/institucional/config";

const NEUTRO: Metadata = {
  title: "Acceso a tu consulta",
  description: "Acceso a tu consulta médica.",
  robots: { index: false, follow: false },
};

/**
 * Metadata de una pantalla del paciente institucional. Se exporta directo como
 * `generateMetadata` desde cada page.
 *
 * En B2C devuelve `{}` (la página es 404 igual): la regla de oro manda, y con
 * el flag apagado no se toca ni la config ni el head del B2C.
 */
export async function metadataPacienteInstitucional(): Promise<Metadata> {
  if (!esInstitucional()) return {};
  try {
    const config = await getConfigInstitucion();
    const nombre = [config.nombre, config.subnombre].filter(Boolean).join(" — ");
    return {
      title: nombre || NEUTRO.title,
      description: "Acceso a tu consulta médica.",
      robots: { index: false, follow: false },
    };
  } catch {
    // Instancia mal provisionada o blip de DB: mejor un título neutro que el
    // del B2C. Nunca se cae por el head.
    return NEUTRO;
  }
}
