// src/lib/auth/rol-institucional.ts
// Roles de OPERADOR de la instancia institucional: 'otorgador' y
// 'admin_institucion'. Fuente de verdad: tabla `operadores`
// (supabase/migrations-institucional/002_operadores.sql — solo existe en la
// DB de la instancia institucional, NUNCA en el B2C).
//
// ── REGLA DE ORO ─────────────────────────────────────────────────────────────
// El gate por modo va PRIMERO: con `INSTITUCIONAL` apagado (B2C) estos roles
// NUNCA se resuelven — `resolverRolInstitucional` devuelve null sin tocar la
// DB (la tabla ni siquiera existe en el B2C). Ningún caller necesita gatear
// por su cuenta: el gate vive acá adentro.
// ─────────────────────────────────────────────────────────────────────────────
//
// `operadores` tiene RLS activo SIN policies (patrón video_presencia): la
// lectura va SIEMPRE por service role (`createAdminClient`), nunca por el
// cliente RLS.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";

export type RolInstitucional = "otorgador" | "admin_institucion";

/** Fila de `operadores` que necesitan los guards (id para auditoría). */
export interface OperadorActivo {
  id: string;
  nombre: string;
  tipo: "humano" | "ia";
  nivel: RolInstitucional;
}

/**
 * Elige el operador que manda cuando un user_id tiene más de una fila activa
 * (el schema no lo prohíbe). Precedencia: admin_institucion > otorgador —
 * consistente con la precedencia global de `rol.ts`
 * (admin > admin_institucion > otorgador > medico > paciente).
 * Función pura: es la parte testeable sin DB.
 */
export function elegirOperador(operadores: OperadorActivo[]): OperadorActivo | null {
  if (operadores.length === 0) return null;
  return operadores.find((o) => o.nivel === "admin_institucion") ?? operadores[0];
}

/** Ruta home de cada rol de operador (redirect post-login). */
export function rutaOperador(rol: RolInstitucional): string {
  return rol === "admin_institucion" ? "/panel" : "/otorgador";
}

type BuscarOperadores = (userId: string) => Promise<OperadorActivo[]>;

/** Lookup real: filas ACTIVAS de `operadores` por user_id, con service role. */
async function buscarOperadoresActivosEnDB(userId: string): Promise<OperadorActivo[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("operadores")
    .select("id, nombre, tipo, nivel")
    .eq("user_id", userId)
    .eq("activo", true);

  if (error) {
    // Fail-closed: ante error de DB el usuario NO es operador. Mismo criterio
    // que isAdmin() — un error transitorio no puede regalar un rol.
    console.error("[rol-institucional] Error consultando operadores:", error);
    return [];
  }
  return (data ?? []) as OperadorActivo[];
}

/**
 * Fila de operador activo del usuario, o null.
 * GATE PRIMERO: en B2C (flag apagado) devuelve null SIN consultar la DB.
 * `buscar` es inyectable solo para tests unitarios.
 */
export async function resolverOperador(
  userId: string | null | undefined,
  buscar: BuscarOperadores = buscarOperadoresActivosEnDB
): Promise<OperadorActivo | null> {
  if (!esInstitucional()) return null; // gate por modo — SIEMPRE primero
  if (!userId) return null;
  return elegirOperador(await buscar(userId));
}

/**
 * Rol institucional del usuario ('otorgador' | 'admin_institucion') o null.
 * En B2C devuelve SIEMPRE null (gate adentro de resolverOperador).
 */
export async function resolverRolInstitucional(
  userId: string | null | undefined,
  buscar?: BuscarOperadores
): Promise<RolInstitucional | null> {
  const operador = await resolverOperador(userId, buscar);
  return operador?.nivel ?? null;
}

// ─── Guards para server actions y API routes (patrón verificarAdmin) ─────────
// Devuelven { user, operador } si la sesión actual tiene el rol, o null si no.
// El caller corta con 401/403 (API) o throw (server action).

async function usuarioConOperador(): Promise<{
  user: { id: string; email?: string };
  operador: OperadorActivo;
} | null> {
  if (!esInstitucional()) return null; // gate por modo — nunca pasa en B2C
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const operador = await resolverOperador(user.id);
  if (!operador) return null;
  return { user, operador };
}

/**
 * Sesión de OTORGADOR (o superior: un admin_institucion también puede otorgar
 * — la precedencia es jerárquica, el nivel alto subsume al bajo).
 */
export async function requireOtorgador() {
  return await usuarioConOperador(); // cualquier nivel de operador activo
}

/** Sesión de ADMIN DE LA INSTITUCIÓN (solo nivel admin_institucion). */
export async function requireAdminInstitucion() {
  const res = await usuarioConOperador();
  if (!res || res.operador.nivel !== "admin_institucion") return null;
  return res;
}
