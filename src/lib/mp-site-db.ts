// ─── Persistencia del país de la cuenta de cobros ─────────────────────────────
// Server-only. Vive aparte de `mp-site.ts` a propósito: ese módulo lo importa
// también el panel admin desde el cliente (`MedicosClient.tsx`), y meterle acá
// el cliente de service role lo arrastraría al bundle del navegador.
//
// Todo lo que hay acá es best-effort: las columnas `site_id` /
// `site_verificado_at` / `site_extranjera_desde` pueden no estar migradas
// todavía y PostgREST falla el statement ENTERO si se nombra una columna
// inexistente. Por eso NUNCA se mezclan con el upsert del OAuth ni con el update
// de la desconexión: si esto falla, lo que importa (la cuenta conectada, la
// cuenta desconectada, la alerta) ya pasó igual.

import { createAdminClient } from "@/lib/supabase/admin";
import { logWarn } from "@/lib/logger";

export type CamposSiteMp = {
  /** `null` = no lo sabemos → se BORRA el dato viejo en vez de dejarlo colgado. */
  site_id: string | null;
  site_verificado_at: string | null;
  /** Desde cuándo sabemos que la cuenta es de otro país (para la cadencia de alertas). */
  site_extranjera_desde?: string | null;
};

/**
 * Guarda (o limpia) el país verificado de la cuenta de cobros de un médico.
 *
 * Limpiar importa tanto como guardar: si el dato queda pegado, el panel puede
 * decir "Cobros de otro país — no puede cobrar" sobre una cuenta que ya se
 * cambió por una argentina, o sobre una cuenta que ya ni siquiera está
 * conectada. Un cartel rojo falso quema la confianza en el cartel rojo.
 *
 * Devuelve `true` si se pudo escribir. Nunca lanza.
 */
export async function guardarSiteMp(
  medicoId: string,
  campos: CamposSiteMp,
  contexto: string
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("medicos_mp_accounts")
      .update(campos)
      .eq("medico_id", medicoId);
    if (error) {
      logWarn(contexto, "No se pudo guardar el país de la cuenta de Mercado Pago", {
        medicoId,
        error: error.message,
      });
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
