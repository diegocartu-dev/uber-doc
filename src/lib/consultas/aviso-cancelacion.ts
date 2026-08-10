// "El paciente canceló esta consulta."
//
// Cuando un paciente abandona una solicitud SIN PAGAR para irse con otro
// profesional, el que se queda esperando tiene que enterarse. Es la contracara
// del permiso: el pasajero puede cancelarle al chofer antes de que llegue, pero
// el chofer no puede quedarse esperando en la esquina (decisión de Diego,
// 09/08/2026).
//
// POR QUÉ DURA 5 MINUTOS
// Es un aviso de descarte, no una tarea. Pasados unos minutos ya no le sirve
// para nada al profesional y solo le ensucia la pantalla. El cartel se muestra
// mientras es útil y después desaparece solo. La fila igual queda en la campana
// como registro de lo que pasó — el aviso se apaga, el hecho no se borra.

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/logger";

/** Cuánto tiempo el aviso se muestra como cartel en el dashboard. */
export const VENTANA_AVISO_CANCELACION_MS = 5 * 60 * 1000;

/**
 * Título exacto de estos avisos. Es la clave con la que el dashboard los
 * distingue del resto de la campana, así que no se toca sin actualizar
 * `PopupCancelacionPaciente`.
 */
export const TITULO_CANCELACION = "El paciente canceló esta consulta";

/**
 * Deja el aviso en la campana del profesional. Nunca lanza: que falle el aviso
 * no puede impedirle al paciente consultar con otro.
 */
export async function avisarCancelacionDelPaciente(
  medicoId: string,
  pacienteNombre: string
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.from("notificaciones_medico").insert({
    medico_id: medicoId,
    titulo: TITULO_CANCELACION,
    mensaje:
      `${pacienteNombre} canceló la consulta que te había solicitado y eligió atenderse con otro profesional. ` +
      `No la había pagado, así que no hay ningún cobro involucrado y no tenés nada que hacer.\n\n` +
      `Te lo avisamos para que no la sigas esperando.`,
    // `enviada_por` en null a propósito: no la mandó un admin, la generó el
    // sistema cuando el paciente canceló.
  });

  if (error) {
    logError("[aviso-cancelacion]", "No se pudo avisar la cancelación al profesional", {
      medicoId,
      error: error.message,
    });
  }
}
