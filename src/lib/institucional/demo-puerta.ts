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

// ─── La misma puerta, para las APIs que sirven datos clínicos ────────────────
//
// ── QUÉ FALTABA ──────────────────────────────────────────────────────────────
// El guard estaba en el layout de `/medico` y en `/api/nova/*`, o sea en las
// PANTALLAS y en la API que escribe. Pero un access token vivo no necesita
// pantallas: `GET /api/documentos/{id}/pdf` devuelve el papel clínico entero, y
// lo hace con el cliente RLS —que para la sesión del participante dice que sí,
// porque la sesión es suya—. Quien fotografió el QR seguía bajando documentos
// durante la hora larga que tarda el JWT en vencer: exactamente la ventana que
// el módulo promete tapar.
//
// ── POR QUÉ ACÁ Y NO EN EL MIDDLEWARE ────────────────────────────────────────
// El middleware sería un solo lugar, sí, pero para responder esta pregunta hay
// que leer `medicos`/`pacientes` y `accesos_link` con SERVICE ROLE. Ponerlo en
// el middleware es cargarle dos queries con la llave maestra a TODOS los
// requests del B2C —incluidos los que ni siquiera son de la instancia— para
// resolver un caso que solo existe en la demo. La puerta va donde se sirve el
// dato, que además es donde se ve al leer el archivo.
//
// ── CUBRE A LOS DOS SUJETOS, NO SOLO AL PROFESIONAL ──────────────────────────
// Un acceso de reunión se emite igual para el participante que entra como
// PACIENTE, y su enlace se proyecta en la misma pared. Si solo se mirara al
// profesional, el mismo agujero quedaría abierto del otro lado (sus documentos,
// su cancelación de consulta). Se pregunta por el sujeto que sea.

/**
 * ¿El sujeto de demostración logueado en ESTE request sigue teniendo derecho a
 * estar adentro? `true` para todo el mundo salvo un participante —profesional o
 * paciente— de una reunión cuyo enlace fue revocado o venció.
 *
 * Mismo fail-open que `profesionalSigueHabilitado` y por el mismo motivo:
 * cerrarle el PDF de su receta a un paciente real por un blip de la base es el
 * daño caro de este lado.
 */
export async function sujetoDemoSigueHabilitado(): Promise<boolean> {
  if (!esInstitucional()) return true;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return true; // sin sesión decide el guard de auth de cada ruta

    // Service role: ni `demo_sesion_id` ni las columnas sensibles de `medicos`
    // tienen GRANT para `authenticated` (CLAUDE.md — el SELECT entero volvería
    // null en silencio).
    const admin = createAdminClient();
    const [medicoRes, pacienteRes] = await Promise.all([
      admin.from("medicos").select("id, demo_sesion_id").eq("user_id", user.id).maybeSingle(),
      admin.from("pacientes").select("id, demo_sesion_id").eq("user_id", user.id).maybeSingle(),
    ]);
    if (medicoRes.error || pacienteRes.error) {
      console.error(
        "[demo] No se pudo leer la ficha del sujeto:",
        medicoRes.error?.message ?? pacienteRes.error?.message
      );
      return true;
    }

    const accesoId = (await cookies()).get(COOKIE_ACCESO)?.value;
    const medico = medicoRes.data as { id: string; demo_sesion_id: string | null } | null;
    if (medico?.demo_sesion_id) {
      return accesoSigueVivo({ accesoId, medicoId: medico.id });
    }
    const paciente = pacienteRes.data as { id: string; demo_sesion_id: string | null } | null;
    if (paciente?.demo_sesion_id) {
      return accesoSigueVivo({ accesoId, pacienteId: paciente.id });
    }
    return true; // no es de ninguna reunión
  } catch (err) {
    console.error("[demo] sujetoDemoSigueHabilitado falló:", err);
    return true;
  }
}

/**
 * La versión para una API: devuelve la respuesta 401 si el acceso murió, o
 * `null` si el request puede seguir. Se escribe así —y no como un throw— para
 * que en el handler se lea como una línea más del guard de autenticación:
 *
 *   const muerto = await respuestaSiAccesoDemoMuerto();
 *   if (muerto) return muerto;
 */
export async function respuestaSiAccesoDemoMuerto(): Promise<Response | null> {
  if (await sujetoDemoSigueHabilitado()) return null;
  return new Response(JSON.stringify({ error: "Este acceso ya no está activo." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
