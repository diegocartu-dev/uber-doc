// Guardado de lo que los profesionales le piden a Nova.
//
// POR QUÉ EXISTE (decisión Diego, 10/08/2026): lo que un médico le pide a la IA
// es la lista de lo que le falta a la app, dicha con sus palabras. Antes de esto
// Nova no guardaba nada: `nova_perfiles` se escribía una vez al abrirla y nunca
// más, así que sabíamos QUIÉNES la abrieron pero no cuántas veces ni para qué.
//
// DOS REGLAS DURAS
//
//   1. ESTO NO PUEDE ROMPER EL CHAT. Todas las funciones son best-effort y
//      ninguna lanza: si la escritura falla, el profesional no se entera y su
//      conversación sigue igual. Guardar para analizar después nunca puede
//      costarle una respuesta a quien está trabajando.
//
//   2. SE GUARDA LA CONVERSACIÓN COMPLETA, SIN FILTRAR. Lo que un profesional
//      le pregunta a Nova es dato que ya se ve en cualquier otra pantalla de
//      /admin. Las tablas van cerradas (RLS sin policies + REVOKE) NO por el
//      contenido sino por pertenencia: sin eso, una sesión `authenticated`
//      podría leer las conversaciones de otro profesional. Por eso este módulo
//      usa `createAdminClient` y vive del lado del servidor.
//
// IDEMPOTENCIA: el frontend reenvía TODO el historial en cada request, así que
// la clave es (conversacion_id, orden) con UNIQUE en la base. Un reintento, un
// doble click o una reconexión no duplican turnos.

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/logger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El id de conversación lo genera el navegador; acá no se confía en él a ciegas. */
export function conversacionIdValido(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_RE.test(valor);
}

/**
 * Asegura la fila de la conversación. Idempotente: si ya existe no la pisa.
 *
 * `medicoId` es `medicos.id` (la PK), NO `auth.users.id`. La distinción importa:
 * `nova_perfiles.medico_id` guarda el user_id pese al nombre, y esa confusión ya
 * hizo que un reporte diera "cero médicos usan Nova" cuando eran diez.
 */
export async function asegurarConversacion(
  conversacionId: string,
  medicoId: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("nova_conversaciones")
      .upsert({ id: conversacionId, medico_id: medicoId }, { onConflict: "id", ignoreDuplicates: true });
  } catch (e) {
    logError("[nova-conv]", "No se pudo abrir la conversación", {
      conversacionId,
      error: String(e),
    });
  }
}

type TurnoNova = {
  conversacionId: string;
  medicoId: string;
  rol: "medico" | "nova";
  contenido: string;
  /** Herramienta que ejecutó Nova en ese turno, si ejecutó alguna. */
  herramienta?: string | null;
  /** Posición en la conversación. Es la mitad de la clave de idempotencia. */
  orden: number;
};

/** Guarda un turno. Nunca lanza. Un contenido vacío no se guarda. */
export async function guardarTurno(t: TurnoNova): Promise<void> {
  const contenido = t.contenido?.trim();
  if (!contenido) return;

  try {
    const admin = createAdminClient();

    const { error } = await admin.from("nova_mensajes").upsert(
      {
        conversacion_id: t.conversacionId,
        medico_id: t.medicoId,
        rol: t.rol,
        contenido,
        herramienta: t.herramienta ?? null,
        orden: t.orden,
      },
      { onConflict: "conversacion_id,orden", ignoreDuplicates: true }
    );

    if (error) {
      logError("[nova-conv]", "No se pudo guardar el turno", {
        conversacionId: t.conversacionId,
        rol: t.rol,
        error: error.message,
      });
    }
  } catch (e) {
    logError("[nova-conv]", "Falla inesperada guardando el turno", {
      conversacionId: t.conversacionId,
      error: String(e),
    });
  }
}
