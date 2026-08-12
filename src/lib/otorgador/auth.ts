// src/lib/otorgador/auth.ts
// Identidad del operador para los endpoints REST de asignación (spec
// institucional §4.2): la MISMA API sirve a la pantalla del otorgador (sesión
// Supabase + fila en `operadores`) y a un operador IA (spec: "María el 2do
// cliente") vía API key — mismos endpoints, misma auditoría, misma
// priorización. SOLO instancia institucional: los dos caminos gatean por modo.
//
// API key: `Authorization: Bearer <key>`. En DB se guarda SOLO el sha256 hex
// (operador_api_keys.key_hash, migración 002); la key pelada se muestra UNA
// vez al generarla y no se puede recuperar.

import { createHash, randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import { requireOtorgador, type OperadorActivo } from "@/lib/auth/rol-institucional";

export interface IdentidadOperador {
  operador: OperadorActivo;
  via: "panel" | "api";
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Genera una key nueva (la parte pelada se devuelve UNA vez; en DB va el hash). */
export function generarApiKey(): { key: string; hash: string } {
  // Prefijo identificable en logs de cliente sin revelar nada + 32 bytes random.
  const key = `dok_${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashApiKey(key) };
}

async function operadorPorApiKey(bearer: string): Promise<OperadorActivo | null> {
  const hash = hashApiKey(bearer);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("operador_api_keys")
    .select("operador_id, activo, operadores!inner(id, nombre, tipo, nivel, activo)")
    .eq("key_hash", hash)
    .eq("activo", true)
    .limit(1)
    .maybeSingle();
  if (error) {
    // Fail-closed: error de DB no regala identidad.
    console.error("[otorgador/auth] Error buscando API key:", error.message);
    return null;
  }
  if (!data) return null;
  const op = data.operadores as unknown as {
    id: string;
    nombre: string;
    tipo: "humano" | "ia";
    nivel: "otorgador" | "admin_institucion";
    activo: boolean;
  };
  if (!op?.activo) return null; // key viva pero operador dado de baja
  return { id: op.id, nombre: op.nombre, tipo: op.tipo, nivel: op.nivel };
}

/**
 * Resuelve la identidad del operador del request:
 *   1. `Authorization: Bearer …` → API key (via 'api').
 *   2. Sesión Supabase con fila de operador activa → via 'panel'.
 * null = 401. Gate por modo PRIMERO: en B2C nada de esto existe.
 */
export async function identificarOperador(req: NextRequest): Promise<IdentidadOperador | null> {
  if (!esInstitucional()) return null;

  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const key = auth.slice("Bearer ".length).trim();
    if (key) {
      const operador = await operadorPorApiKey(key);
      return operador ? { operador, via: "api" } : null;
    }
    return null;
  }

  const sesion = await requireOtorgador();
  return sesion ? { operador: sesion.operador, via: "panel" } : null;
}
