// src/lib/admin-auth.ts
// Reemplaza src/lib/admin.ts (array hardcodeado ADMIN_EMAILS)

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminLevel = "super_admin" | "admin";

export interface AdminUserInfo {
  id: string;
  user_id: string;
  nivel: AdminLevel;
  activo: boolean;
}

/**
 * Verifica si el userId actual es admin activo.
 * Usa supabaseAdmin (service role) para bypass RLS y evitar
 * el problema de que admin_users solo es legible por admins.
 */
export async function isAdmin(
  userId: string | null | undefined
): Promise<boolean> {
  if (!userId) return false;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, activo")
    .eq("user_id", userId)
    .eq("activo", true)
    .maybeSingle();

  if (error) {
    console.error("[admin-auth] Error consultando admin_users:", error);
    return false;
  }

  return !!data;
}

/**
 * Devuelve el nivel del admin (super_admin o admin), o null si no es admin.
 */
export async function getAdminLevel(
  userId: string
): Promise<AdminLevel | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("admin_users")
    .select("nivel")
    .eq("user_id", userId)
    .eq("activo", true)
    .maybeSingle();

  return (data?.nivel as AdminLevel) ?? null;
}

/**
 * Devuelve info completa del admin actual o null.
 */
export async function getAdminUser(
  userId: string
): Promise<AdminUserInfo | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("admin_users")
    .select("id, user_id, nivel, activo")
    .eq("user_id", userId)
    .eq("activo", true)
    .maybeSingle();

  return data as AdminUserInfo | null;
}

/**
 * Helper para acciones que requieren super_admin.
 * Lanza si no lo es.
 */
export async function requireSuperAdmin(
  userId: string
): Promise<AdminUserInfo> {
  const admin = await getAdminUser(userId);
  if (!admin || admin.nivel !== "super_admin") {
    throw new Error("Esta accion requiere nivel super_admin");
  }
  return admin;
}

/**
 * Verificar admin desde request (para API routes).
 * Lee la sesion desde cookies y verifica admin_users.
 */
export async function verificarAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const esAdmin = await isAdmin(user.id);
  if (!esAdmin) return null;

  return user;
}
