// src/lib/institucional/config.ts
// Lectura de la config de la institución (tabla singleton `institucion_config`,
// supabase/migrations-institucional/001_institucion_config.sql — solo existe
// en la DB de la instancia institucional, NUNCA en el B2C).
//
// Patrón calcado de src/lib/feature-flags.ts: service role + cache
// module-level, acá con TTL de 60 s (la config cambia poco y desde /admin).
//
// ── FAIL-SAFE EXPLÍCITO ──────────────────────────────────────────────────────
// Sin fila (id=1) la instancia está MAL PROVISIONADA y esto TIRA un error
// claro. Jamás defaults inventados: una config "de mentira" haría que la
// marca blanca muestre una institución fantasma y que la operación (ventana
// CI, duración de slot) corra con números que nadie decidió.
// ─────────────────────────────────────────────────────────────────────────────
//
// ── COLUMNAS COMERCIALES ─────────────────────────────────────────────────────
// `precio_consulta_centavos` y `acuerdo_horas_semana_default` son términos del
// contrato con el cliente: NO tienen GRANT para `authenticated` (ver la
// migración) y NUNCA viajan al cliente. Todo lo que se pase a componentes
// client o se serialice hacia el browser usa `getBrandingInstitucion()` /
// `soloBranding()`, que las EXCLUYEN. `getConfigInstitucion()` (fila entera)
// es solo para código server (metering, /admin interno).
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";

/** Fila completa de `institucion_config`. SOLO server — incluye lo comercial. */
export interface ConfigInstitucion {
  id: number;
  // Identidad
  nombre: string;
  subnombre: string | null;
  logo_path: string | null;
  color_primary: string;
  color_primary_dark: string;
  color_primary_soft: string;
  dominio: string;
  // Documentos
  pdf_accent: string | null;
  pdf_isologo_path: string | null;
  pdf_efector_texto: string;
  // Comunicaciones
  wa_remitente_nombre: string | null;
  mail_from: string;
  telefono_ayuda: string | null;
  // Operación
  ci_ventana_inicio: string; // "08:00:00" (time de Postgres)
  ci_ventana_fin: string;
  slot_duracion_min: number;
  especialidades: string[];
  // Comercial — SIN grant a authenticated; jamás al cliente
  acuerdo_horas_semana_default: number;
  precio_consulta_centavos: number;
  updated_at: string;
}

/** Subconjunto CLIENT-SAFE: branding + operación, sin columnas comerciales. */
export type BrandingInstitucion = Omit<
  ConfigInstitucion,
  "precio_consulta_centavos" | "acuerdo_horas_semana_default"
>;

/**
 * Proyección pura fila completa → branding. Es LA lista blanca: si mañana la
 * tabla suma una columna comercial, hay que excluirla acá (por eso se copia
 * campo a campo y no se hace spread — un spread arrastraría lo nuevo).
 */
export function soloBranding(config: ConfigInstitucion): BrandingInstitucion {
  return {
    id: config.id,
    nombre: config.nombre,
    subnombre: config.subnombre,
    logo_path: config.logo_path,
    color_primary: config.color_primary,
    color_primary_dark: config.color_primary_dark,
    color_primary_soft: config.color_primary_soft,
    dominio: config.dominio,
    pdf_accent: config.pdf_accent,
    pdf_isologo_path: config.pdf_isologo_path,
    pdf_efector_texto: config.pdf_efector_texto,
    wa_remitente_nombre: config.wa_remitente_nombre,
    mail_from: config.mail_from,
    telefono_ayuda: config.telefono_ayuda,
    ci_ventana_inicio: config.ci_ventana_inicio,
    ci_ventana_fin: config.ci_ventana_fin,
    slot_duracion_min: config.slot_duracion_min,
    especialidades: config.especialidades,
    updated_at: config.updated_at,
  };
}

const CACHE_TTL_MS = 60_000;

let cache: { config: ConfigInstitucion; fetchedAt: number } | null = null;

/** Solo para tests y para el editor de /admin tras guardar (invalidación). */
export function invalidarCacheConfigInstitucion(): void {
  cache = null;
}

/**
 * Fila completa de config, con cache de 60 s. SOLO código server.
 * - Fuera del modo institucional → error (nadie debería llamarla en B2C).
 * - Sin fila → error claro de instancia mal provisionada (fail-safe).
 * - Error transitorio de DB con cache previo → devuelve el cache vencido
 *   (mismo criterio que feature-flags: no apagar la marca por un blip).
 */
export async function getConfigInstitucion(): Promise<ConfigInstitucion> {
  if (!esInstitucional()) {
    throw new Error(
      "getConfigInstitucion() llamada fuera del modo institucional: esto es un bug — " +
        "en B2C no existe institucion_config. Gatear el caller con esInstitucional()."
    );
  }

  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.config;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("institucion_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (cache) {
      // Blip de DB: conservar la última config conocida (renovando el
      // timestamp para no martillar una DB caída) antes que romper la página.
      console.error("[institucional/config] Error leyendo config, uso cache vencido:", error);
      cache = { config: cache.config, fetchedAt: Date.now() };
      return cache.config;
    }
    throw new Error(
      `No se pudo leer institucion_config y no hay cache previo: ${error.message}`
    );
  }

  if (!data) {
    // FAIL-SAFE EXPLÍCITO: sin fila no hay defaults. La instancia no está
    // provisionada — se provisiona desde el /admin interno (página Institución).
    throw new Error(
      "Instancia institucional MAL PROVISIONADA: no existe la fila de institucion_config (id=1). " +
        "Crearla desde /admin/institucion antes de operar. No hay defaults."
    );
  }

  const config = data as ConfigInstitucion;
  cache = { config, fetchedAt: Date.now() };
  return config;
}

/**
 * Config CLIENT-SAFE (branding + operación, sin columnas comerciales).
 * Es la única función cuyo resultado puede viajar a componentes client.
 */
export async function getBrandingInstitucion(): Promise<BrandingInstitucion> {
  return soloBranding(await getConfigInstitucion());
}
