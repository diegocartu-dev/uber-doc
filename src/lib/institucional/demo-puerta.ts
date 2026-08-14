// src/lib/institucional/demo-puerta.ts
// LA PUERTA DEL PROFESIONAL INVITADO, para todas sus pantallas y no solo una.
// SOLO instancia institucional.
//
// ── QUÉ RESUELVE ─────────────────────────────────────────────────────────────
// El enlace del participante es una credencial bearer que se proyecta en la
// pared de una sala de reuniones: quien lo fotografía, entra. Revocarlo
// ("regenerar el QR", "limpiar reunión") apaga el token Y cierra la sesión que
// ese token minteó… pero el access token que el navegador ya tiene en la mano
// sigue siendo válido hasta que expire, cerca de una hora después.
//
// Esa hora la tapa `profesionalDemoSigueAdentro`, que mira la cookie del acceso
// en cada request. El problema era DÓNDE se llamaba: en `/dashboard` y en ningún
// otro lado. Con el JWT todavía vivo, el que fotografió el QR seguía entrando a
// `/medico/agenda`, a `/medico/paciente/...`, al workspace de una consulta —o
// sea a historia clínica de la institución— y a `/api/nova/*`, que además ESCRIBE
// (crea agendas, bloquea períodos).
//
// Acá vive la puerta una sola vez, y la usan el layout de `/medico` (que cuelga
// de todas esas pantallas, workspace incluido) y las rutas de Nova.
//
// ── FAIL-OPEN PARA TODOS LOS DEMÁS, A PROPÓSITO ──────────────────────────────
// La cookie se le exige ÚNICAMENTE a un profesional con `demo_sesion_id`. El
// profesional real de la institución entra por login con contraseña y no tiene
// ninguna cookie de acceso: pedírsela lo dejaría afuera de su propio trabajo. Y
// en B2C esto no existe — el gate por modo corta antes de tocar la base.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import { COOKIE_ACCESO, accesoSigueVivo } from "@/lib/institucional/accesos";

/** A dónde va el que ya no puede estar adentro. */
export const DESTINO_ACCESO_MUERTO = "/acceso/invalido";

/**
 * ¿El profesional logueado en ESTE request sigue teniendo derecho a estar
 * adentro? `true` para todo el mundo salvo un profesional de demostración cuyo
 * enlace fue revocado o venció.
 *
 * Nunca lanza: ante un blip de la base deja pasar. Cerrarle el dashboard a un
 * profesional real por un error de lectura es el daño caro de este lado, y el
 * token de la demo vence solo en horas de todos modos (`HORAS_ACCESO_DEMO`).
 */
export async function profesionalSigueHabilitado(): Promise<boolean> {
  if (!esInstitucional()) return true;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Sin sesión no hay nada que decidir acá: de eso se encarga el guard de
    // autenticación de cada pantalla.
    if (!user) return true;

    // Service role y query aparte: `demo_sesion_id` no tiene GRANT para
    // `authenticated`, y con el cliente RLS el SELECT entero devolvería null.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("medicos")
      .select("id, demo_sesion_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.error("[demo] No se pudo leer la ficha del profesional:", error.message);
      return true;
    }
    // No es profesional (un paciente, un admin) o no es de una reunión.
    if (!data || !data.demo_sesion_id) return true;

    const accesoId = (await cookies()).get(COOKIE_ACCESO)?.value;
    return accesoSigueVivo({ accesoId, medicoId: data.id as string });
  } catch (err) {
    console.error("[demo] profesionalSigueHabilitado falló:", err);
    return true;
  }
}

/**
 * Lo mismo, para una pantalla: si el acceso murió, redirige. Se llama desde el
 * layout de `/medico`, que es el ancestro de la agenda, de "mis pacientes" y del
 * workspace de la consulta.
 */
export async function exigirProfesionalHabilitado(): Promise<void> {
  if (!(await profesionalSigueHabilitado())) redirect(DESTINO_ACCESO_MUERTO);
}
