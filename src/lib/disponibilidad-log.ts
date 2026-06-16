import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Registra una transición de disponibilidad para Consulta Inmediata de un médico
 * (online = se puso disponible, offline = se sacó) en `disponibilidad_log`.
 * Sirve para medir la OFERTA de CI por franja horaria en el panel de insights.
 *
 * Non-blocking a propósito: si el insert falla, NO debe romper el toggle de
 * disponibilidad del médico — el log es secundario. Por eso captura su error.
 */
export async function logDisponibilidad(medicoId: string, online: boolean): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("disponibilidad_log").insert({ medico_id: medicoId, online });
  } catch (e) {
    console.error("[disponibilidad_log] insert falló:", e);
  }
}
