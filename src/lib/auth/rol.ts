import { redirect } from "next/navigation";
import type { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";
import { resolverRolInstitucional, rutaOperador } from "@/lib/auth/rol-institucional";

// Resolución de rol CENTRAL para toda la app. Antes cada página decidía sola y con
// criterios distintos (ej: /dashboard chequeaba médico/paciente ANTES que admin, así
// que un admin con fila de paciente quedaba "tapado" y caía en la vista de paciente).
// Acá la precedencia es ÚNICA: admin > admin_institucion > otorgador > médico > paciente.
// Los dos roles de operador SOLO existen en la instancia institucional
// (INSTITUCIONAL=true): en B2C jamás se resuelven — el gate vive adentro de
// resolverRolInstitucional, que devuelve null sin tocar la DB.

export type RolUsuario = "admin" | "admin_institucion" | "otorgador" | "medico" | "paciente" | null;

type Supa = Awaited<ReturnType<typeof createClient>>;

/**
 * Resuelve el rol con precedencia ADMIN > ADMIN_INSTITUCION > OTORGADOR > MÉDICO > PACIENTE.
 * Fuente de verdad: las TABLAS (admin_users / operadores / medicos / pacientes), no el
 * user_metadata.role (que puede quedar desactualizado). Un usuario recién registrado
 * que todavía no tiene fila en ninguna (en pleno onboarding) → null.
 */
export async function resolverRol(supabase: Supa, userId: string): Promise<RolUsuario> {
  if (await isAdmin(userId)) return "admin";
  // Roles de operador institucional — en B2C esto devuelve null sin query.
  const rolInst = await resolverRolInstitucional(userId);
  if (rolInst) return rolInst;
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
  // Operadores institucionales → su pantalla (solo pueden resolverse bajo flag).
  if (rol === "admin_institucion" || rol === "otorgador") redirect(rutaOperador(rol));
  if (rol === "medico") redirect("/dashboard");
  // Sin fila en ninguna tabla: puede ser un paciente nuevo (pasa, hace su
  // onboarding) o un MÉDICO que dejó el registro a mitad. A ese hay que
  // devolverlo a su formulario, no pedirle obra social.
  if (rol === null && (await esMedicoEnRegistro(supabase, userId))) {
    redirect("/registro-medico/continuar");
  }
  // "paciente" o null → permitido
}

/**
 * Médico que creó la cuenta pero todavía NO tiene ficha en `medicos` (abandonó
 * la Fase B del registro). Hoy son ~14 personas reales.
 *
 * Único caso donde manda `user_metadata.role`: sin ficha, las tablas no saben
 * nada de él y el default lo trataba como paciente nuevo — le creaba una ficha
 * de paciente y le pedía DNI, sexo y obra social. Un médico que vuelve y escribe
 * docto.com.ar se encontraba con eso (hallazgo 06/08). El metadata lo escribe
 * el propio signup del médico, así que para este caso es fuente confiable.
 */
export async function esMedicoEnRegistro(supabase: Supa, userId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return false;
  if (user.user_metadata?.role !== "medico") return false;
  const { data: med } = await supabase.from("medicos").select("id").eq("user_id", userId).maybeSingle();
  return !med;
}
