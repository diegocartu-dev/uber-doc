import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/logger";

export type TipoRecurso = "turno" | "consulta";
export type EstadoPendiente = "pendiente" | "fee_pendiente";

/**
 * Registra (o actualiza) un refund que no se completó del todo para que el cron
 * `cron/reintentar-refunds` lo reintente cada 24hs.
 *
 * Idempotente por `(tipo, recurso_id)`: una sola fila por recurso. El upsert NO
 * pisa `intentos` ni `creado_at` (no van en el payload), así que un reintento
 * conserva el contador y la antigüedad que usa la escalada a las 48hs.
 *
 *  - `fee_pendiente`: la pata del médico salió OK, solo falta devolver el fee de
 *    Docto. El cron reintenta únicamente esa pata.
 *  - `pendiente`: la pata del médico falló (típicamente saldo insuficiente). El
 *    cron reintenta el refund completo; a las 48hs escala a cobertura manual.
 */
export async function registrarRefundPendiente(params: {
  tipo: TipoRecurso;
  recursoId: string;
  medicoId: string;
  pagoId: string;
  netoMedico: number;
  applicationFee: number;
  estado: EstadoPendiente;
  /** Id del refund de la pata del médico, si ya salió OK (caso `fee_pendiente`). */
  medicoRefundId?: string;
  error?: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const ahora = new Date();
  const proximo = new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("refunds_pendientes").upsert(
    {
      tipo: params.tipo,
      recurso_id: params.recursoId,
      medico_id: params.medicoId,
      pago_id: params.pagoId,
      neto_medico: params.netoMedico,
      application_fee: params.applicationFee,
      estado: params.estado,
      medico_refund_id: params.medicoRefundId ?? null,
      ultimo_error: params.error ?? null,
      ultimo_intento_at: ahora.toISOString(),
      proximo_intento_at: proximo,
    },
    { onConflict: "tipo,recurso_id" }
  );

  if (error) {
    logError("[REFUND-PENDIENTE]", "Error registrando refund pendiente", {
      tipo: params.tipo,
      recursoId: params.recursoId,
      medicoId: params.medicoId,
      estado: params.estado,
      error: error.message,
    });
  }
}
