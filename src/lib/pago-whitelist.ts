import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Whitelist de cobro real (prueba controlada en producción, pre-go-live).
 *
 * Permite activar el cobro real de Mercado Pago para un conjunto acotado de
 * cuentas (paciente + médico familiares) SIN prender el flag global
 * `pago_marketplace` en producción. El flag global expone a TODOS los usuarios
 * de golpe; esto lo limita a los emails de la whitelist.
 *
 * Fuente: env var `MP_PAGO_REAL_WHITELIST` = lista de emails separados por coma.
 * Mismo patrón que `MP_TEST_SELLERS_WHITELIST` (OAuth sandbox E2E).
 *
 * Semántica del cobro real (en `crear-v2`):
 *   - Flag global `pago_marketplace` ON  → cobro real para todos (go-live real).
 *   - Flag OFF + paciente Y médico en whitelist → cobro real solo para ellos.
 *   - Flag OFF + alguno fuera de whitelist → 503 → el front cae a `/simular`.
 *
 * Si la env var está vacía/ausente, la whitelist no habilita a nadie: el
 * comportamiento es idéntico al actual (todo simula mientras el flag esté off).
 */
function parseWhitelist(): Set<string> {
  return new Set(
    (process.env.MP_PAGO_REAL_WHITELIST ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function emailEnWhitelistPagoReal(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseWhitelist().has(email.trim().toLowerCase());
}

/**
 * Resuelve el email de un usuario auth por su id (service role, bypass RLS).
 * Devuelve null si no existe o no tiene email.
 */
export async function emailDeUsuario(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  return data.user.email ?? null;
}

/**
 * Decide si una transacción puntual (paciente + médico) debe cobrarse de verdad
 * aunque el flag global esté apagado. Requiere que AMBAS partes estén en la
 * whitelist — alcanza con que una no esté para caer al flujo simulado y no
 * cobrarle a un tercero por accidente.
 */
export async function transaccionHabilitadaParaCobroReal(params: {
  pacienteUserId: string | null | undefined;
  medicoUserId: string | null | undefined;
}): Promise<boolean> {
  const whitelist = parseWhitelist();
  if (whitelist.size === 0) return false;

  const [pacienteEmail, medicoEmail] = await Promise.all([
    emailDeUsuario(params.pacienteUserId),
    emailDeUsuario(params.medicoUserId),
  ]);

  return emailEnWhitelistPagoReal(pacienteEmail) && emailEnWhitelistPagoReal(medicoEmail);
}
