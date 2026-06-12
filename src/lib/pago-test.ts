import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ¿La transacción involucra una cuenta de test? (paciente O médico).
 *
 * Las cuentas de test SIEMPRE simulan el pago, sin importar el flag global
 * `pago_marketplace` ni la whitelist — misma regla que el guard de `crear-v2`.
 * Se usa para que el fallback simulado (CI: `/api/pago/simular`; turno:
 * `confirmarPagoTurno`) siga funcionando con el cobro real general prendido.
 */
export async function transaccionEsDeTest(params: {
  pacienteUserId?: string | null;
  medicoId?: string | null;
}): Promise<boolean> {
  const admin = createAdminClient();
  const [{ data: med }, { data: pac }] = await Promise.all([
    params.medicoId
      ? admin.from("medicos").select("es_cuenta_test").eq("id", params.medicoId).maybeSingle()
      : Promise.resolve({ data: null }),
    params.pacienteUserId
      ? admin.from("pacientes").select("es_cuenta_test").eq("user_id", params.pacienteUserId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return !!med?.es_cuenta_test || !!pac?.es_cuenta_test;
}
