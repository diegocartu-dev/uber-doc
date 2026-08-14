// src/lib/institucional/branding-pdf.ts
// El puente entre la config de la institución y el generador de documentos
// (spec institucional §7, 03-spec §3). SOLO instancia institucional.
//
// ── POR QUÉ ESTE MÓDULO EXISTE Y NO SE LLAMA A `getConfigInstitucion()` DESDE
//    LAS RUTAS ────────────────────────────────────────────────────────────────
// Porque el isologo es un archivo de Storage y hay DOS callers que emiten el
// mismo papel (la descarga del paciente y la de la institución). Si cada uno
// resolviera el asset por su cuenta, tarde o temprano uno de los dos sale con
// marca y el otro sin — y son el MISMO documento, con el mismo id, que alguien
// puede llegar a comparar.
//
// ── LA REGLA DE ORO, ACÁ ─────────────────────────────────────────────────────
// En B2C esta función devuelve `undefined` SIN tocar la DB ni el Storage, y el
// generador con `undefined` produce el papel de siempre, byte a byte (golden en
// `src/lib/pdf/receta-golden.test.ts`). El gate vive acá adentro: los callers
// llaman siempre y no gatean por su cuenta.
//
// ── FALLA BLANDA, A PROPÓSITO ────────────────────────────────────────────────
// A diferencia de `getConfigInstitucion()` —que TIRA si la instancia está mal
// provisionada—, acá un error se traga y devuelve `undefined`. El motivo es que
// el caller es la descarga de una receta que el paciente ya tiene prometida: es
// preferible un documento con la marca de Docto que un 500 en la cara de
// alguien que necesita su receta. Queda en el log, fuerte.

import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import { getConfigInstitucion, dominioLimpio, type ConfigInstitucion } from "@/lib/institucional/config";
import { documentoEsDemo } from "@/lib/institucional/demo";
import type { BrandingPDF } from "@/lib/pdf/receta";

/** Bucket de los assets de marca de la instancia (migración 018). */
export const BUCKET_ASSETS = "institucion-assets";

/** El isologo pesa poco y cambia casi nunca: se cachea el buffer, no el archivo. */
const CACHE_ISOLOGO_MS = 10 * 60_000;
let cacheIsologo: { path: string; buffer: Buffer | null; fetchedAt: number } | null = null;

/**
 * Solo para tests y para el editor de /admin tras cambiar el asset.
 *
 * ⚠ ALCANCE: vacía el cache de ESTE proceso, igual que
 * `invalidarCacheConfigInstitucion()`. Los otros lambdas vencen solos a los 10
 * minutos. Por eso `subirAssetInstitucion()` sube el archivo con una ruta
 * VERSIONADA (`isologo_pdf-<ts>.png`) en vez de pisar la anterior: como el
 * cache se indexa por `path`, una ruta nueva no acierta en ningún lambda y el
 * isologo nuevo sale desde el primer documento. Reemplazar el ARCHIVO dejando
 * la misma ruta —el caso "cambiaron el logo"— serviría el buffer viejo hasta
 * 10 minutos, y los documentos emitidos en esa ventana saldrían con el
 * logotipo anterior. También se cachea el FALLO, así que un isologo recién
 * arreglado tardaría lo mismo en aparecer.
 */
export function invalidarCacheIsologo(): void {
  cacheIsologo = null;
}

async function bajarIsologo(path: string | null): Promise<Buffer | null> {
  if (!path) return null;
  if (cacheIsologo && cacheIsologo.path === path && Date.now() - cacheIsologo.fetchedAt < CACHE_ISOLOGO_MS) {
    return cacheIsologo.buffer;
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(BUCKET_ASSETS).download(path);
    if (error || !data) {
      console.error("[institucional/branding-pdf] No se pudo bajar el isologo:", path, error?.message);
      // Se cachea el fallo igual: si el archivo no está, no tiene sentido
      // golpear el Storage en cada receta que se descarga.
      cacheIsologo = { path, buffer: null, fetchedAt: Date.now() };
      return null;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    cacheIsologo = { path, buffer, fetchedAt: Date.now() };
    return buffer;
  } catch (err) {
    console.error("[institucional/branding-pdf] Error bajando el isologo:", path, err);
    cacheIsologo = { path, buffer: null, fetchedAt: Date.now() };
    return null;
  }
}

/**
 * El acento EFECTIVO del papel institucional.
 *
 * `pdf_accent` es opcional a propósito: existe para el caso en que el color del
 * chrome no funcione impreso (un violeta muy claro sobre papel blanco, por
 * ejemplo). Cuando está vacío —que es el caso normal, y el único posible hasta
 * que alguien lo complete en /admin— el acento del documento es el PRIMARIO DE
 * LA INSTITUCIÓN, no el azul de Docto.
 *
 * Esto es lo que la migración 001 declara como contrato desde el día uno
 * (`pdf_accent text, -- default efectivo: color_primary`) y no estaba
 * implementado en ningún lado: con `pdf_accent` en NULL, `accentDe()` caía a
 * `COLORS.accent` = #378ADD y el papel del ministerio salía con los labels, la
 * línea del header y los marcadores "1. Rp/" pintados del azul de marca de
 * Docto. Justo la filtración que la marca blanca existe para evitar, y en la
 * dirección que importa legalmente.
 *
 * Es una función pura y exportada para poder testearla sin DB.
 */
export function accentEfectivo(
  config: Pick<ConfigInstitucion, "pdf_accent" | "color_primary">
): string {
  const elegido = (config.pdf_accent ?? "").trim();
  return elegido || config.color_primary;
}

/**
 * La marca blanca del documento, lista para `generarRecetaPDF(doc, branding)`.
 * `undefined` = sin marca institucional → el papel del B2C, intacto.
 */
export async function brandingParaPDF(documentoId?: string): Promise<BrandingPDF | undefined> {
  if (!esInstitucional()) return undefined;

  // ── LA MARCA DE DEMOSTRACIÓN SE RESUELVE FUERA DEL TRY ────────────────────
  // Estaba adentro, junto a `getConfigInstitucion()` y a la bajada del isologo
  // del Storage. O sea que la falla blanda que este módulo tiene A PROPÓSITO
  // —preferir un papel sin marca institucional antes que un 500 en la cara de
  // alguien que necesita su receta— se tragaba también la marca de
  // demostración: un blip leyendo un PNG del Storage y el papel firmado por una
  // cuenta de demo salía LIMPIO, sin marca de agua y sin leyenda al pie.
  //
  // Las dos cosas no son del mismo orden. Que el documento salga con la marca de
  // Docto en vez de la del ministerio es feo. Que salga sin la única señal que
  // impide que un papel firmado en una sala de reuniones termine en un mostrador
  // de farmacia, no es feo: es el riesgo que el modo demo existe para evitar.
  //
  // Se decide ACÁ, en el mismo lugar que el resto del papel, por el mismo motivo
  // por el que este módulo existe: hay dos callers que emiten el MISMO documento
  // (la descarga del paciente y la de la institución). Si cada uno resolviera la
  // marca por su cuenta, tarde o temprano uno sale marcado y el otro no — y es
  // el mismo papel, con el mismo id, que alguien puede llegar a comparar.
  const demo = await documentoEsDemo(documentoId);

  try {
    const config = await getConfigInstitucion();
    return {
      nombre: config.nombre,
      subnombre: config.subnombre,
      isologoBuffer: await bajarIsologo(config.pdf_isologo_path),
      accent: accentEfectivo(config),
      efectorTexto: config.pdf_efector_texto ?? "",
      demo,
      // El QR del documento, al dominio de la INSTITUCIÓN. Era lo único del
      // papel que no pasaba por la marca blanca: salía de `NEXT_PUBLIC_SITE_URL`
      // y, si el deploy de la instancia no la tiene apuntando a su propio
      // dominio, apuntaba al B2C — otra base, donde ese `documentos.id` no
      // existe. El QR proyectado en la reunión daría "documento no encontrado".
      verificarBaseUrl: `https://${dominioLimpio(config.dominio)}`,
    };
  } catch (err) {
    console.error("[institucional/branding-pdf] Sin branding para el documento:", err);
    // Sin marca institucional, pero CON la de demostración si corresponde: el
    // generador dibuja la marca de agua y la leyenda con esto solo.
    if (demo) return { nombre: "", efectorTexto: "", demo: true };
    return undefined;
  }
}
