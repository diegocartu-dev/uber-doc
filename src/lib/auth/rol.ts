import { redirect } from "next/navigation";
import type { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";

// Resolución de rol CENTRAL para toda la app. Antes cada página decidía sola y con
// criterios distintos (ej: /dashboard chequeaba médico/paciente ANTES que admin, así
// que un admin con fila de paciente quedaba "tapado" y caía en la vista de paciente).
// Acá la precedencia es ÚNICA: admin > médico > paciente.

export type RolUsuario = "admin" | "medico" | "paciente" | null;

type Supa = Awaited<ReturnType<typeof createClient>>;

/**
 * Resuelve el rol con precedencia ADMIN > MÉDICO > PACIENTE.
 * Fuente de verdad: las TABLAS (admin_users / medicos / pacientes), no el
 * user_metadata.role (que puede quedar desactualizado). Un usuario recién registrado
 * que todavía no tiene fila en ninguna (en pleno onboarding) → null.
 */
export async function resolverRol(supabase: Supa, userId: string): Promise<RolUsuario> {
  if (await isAdmin(userId)) return "admin";
  const { data: med } = await supabase.from("medicos").select("id").eq("user_id", userId).maybeSingle();
  if (med) return "medico";
  const { data: pac } = await supabase.from("pacientes").select("id").eq("user_id", userId).maybeSingle();
  if (pac) return "paciente";
  return null;
}

/**
 * Guard para RUTAS DE PACIENTE: si quien entra NO es paciente, lo redirige a su lugar.
 *   - admin  → /admin
 *   - médico → /dashboard
 *   - paciente (o usuario nuevo sin fila todavía, en onboarding) → PASA sin redirigir
 * Lanza el redirect de Next (NEXT_REDIRECT) cuando corresponde, así que llamar y seguir.
 * Importante: un usuario `null` (recién registrado) DEBE pasar para no romper el
 * onboarding del paciente nuevo.
 */
export async function guardRutaPaciente(supabase: Supa, userId: string): Promise<void> {
  const rol = await resolverRol(supabase, userId);
  if (rol === "admin") redirect("/admin");
  if (rol === "medico") redirect("/dashboard");
  // "paciente" o null → permitido
}
