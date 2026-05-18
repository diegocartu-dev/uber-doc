// src/lib/feature-flags.ts
// Flags globales con cache de 5 segundos.

import { createAdminClient } from "@/lib/supabase/admin";

const CACHE_TTL_MS = 5000;

interface FlagCache {
  flags: Map<string, boolean>;
  fetchedAt: number;
}

let cache: FlagCache | null = null;

/**
 * Obtener el estado de un flag por key.
 * Cache de 5 segundos para no consultar DB en cada request.
 */
export async function getFlag(key: string): Promise<boolean> {
  // Override por env var — permite forzar flags en Preview/staging
  // sin tocar la DB compartida de producción.
  // Ej: OVERRIDE_FLAG_PAGO_MARKETPLACE=true
  const envKey = `OVERRIDE_FLAG_${key.toUpperCase()}`;
  const envVal = process.env[envKey];
  if (envVal === "true") return true;
  if (envVal === "false") return false;

  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.flags.get(key) ?? false;
  }

  await refreshCache();
  return cache!.flags.get(key) ?? false;
}

/**
 * Obtener todos los flags. Util para el panel admin.
 */
export async function getAllFlags(): Promise<
  Array<{
    key: string;
    activo: boolean;
    nombre: string;
    descripcion: string;
    es_kill_switch: boolean;
  }>
> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .select("key, activo, nombre, descripcion, es_kill_switch")
    .order("es_kill_switch", { ascending: false })
    .order("key");

  if (error) {
    console.error("[feature-flags] Error fetching all flags:", error);
    return [];
  }

  return data || [];
}

async function refreshCache(): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("feature_flags")
    .select("key, activo");

  const flags = new Map<string, boolean>();
  (data || []).forEach((row) => flags.set(row.key, row.activo));

  cache = { flags, fetchedAt: Date.now() };
}

/**
 * Invalidar cache. Llamar despues de cambiar un flag desde el panel admin.
 */
export function invalidateFlagsCache(): void {
  cache = null;
}
