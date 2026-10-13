// ─── Término aparte: medicamentos controlados (decisión Diego, 12/10/2026) ────
//
// La regla: por Docto se puede recetar cualquier medicamento, excepto
// psicotrópicos y estupefacientes (Leyes 19.303 y 17.818). Los antibióticos NO
// entran en la limitación. El bloqueo en la receta ya existía
// (`src/data/controlados.ts`); esto es lo que lo dice, como un término corto,
// aparte del resto de los T&C y con su propio tilde.
//
// Lo tildan:
//   - el paciente, antes de pagar (triage de la consulta inmediata y
//     confirmación de la reserva del turno);
//   - el profesional al registrarse, y los ya registrados una vez desde su panel
//     (pueden posponerlo: se les vuelve a mostrar hasta que lo tilden).
//
// IMPORTANTE: este texto es la fuente de verdad versionada. Si cambia, se sube
// CONTROLADOS_VERSION y se siembra la versión nueva en versiones_textos_legales
// (la migración 20261012_termino_controlados.sql tiene la v1). El test
// `controlados.test.ts` falla si el texto de acá y el sembrado se separan.
//
// Solo B2C: la instancia institucional es marca blanca (el texto dice "Docto").

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";

import { CONTROLADOS_TIPO, CONTROLADOS_VERSION } from "./controlados-texto";
export * from "./controlados-texto";

async function versionId(): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("versiones_textos_legales")
    .select("id")
    .eq("tipo", CONTROLADOS_TIPO)
    .eq("version", CONTROLADOS_VERSION)
    .maybeSingle();
  if (error) {
    console.error("[controlados] no se pudo leer la versión del término:", error.message);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Registra un tilde real del término. Una fila por acto, con la consulta o el
 * turno en el que se tildó. Como el término es dinámico (se muestra solo a quien
 * no aceptó la versión vigente), en la práctica es una vez por persona y versión.
 *
 * Nunca lanza ni frena el flujo que lo llama: la casilla ya se exigió en la
 * pantalla, y una consulta no se pierde porque falle el registro. Si falla, lo
 * dice el log con el motivo.
 */
export async function registrarAceptacionControlados(params: {
  userId: string;
  consultaId?: string | null;
  turnoId?: string | null;
}): Promise<boolean> {
  if (esInstitucional()) return false;
  try {
    const id = await versionId();
    if (!id) {
      console.error("[controlados] falta la versión del término en versiones_textos_legales");
      return false;
    }
    let ip: string | null = null;
    let ua: string | null = null;
    try {
      const h = await headers();
      ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      ua = h.get("user-agent") ?? null;
    } catch {
      // Fuera de un pedido (no debería pasar): se registra sin IP ni navegador.
    }
    const { error } = await createAdminClient().from("aceptaciones_legales").insert({
      user_id: params.userId,
      version_id: id,
      tipo: CONTROLADOS_TIPO,
      consulta_id: params.consultaId ?? null,
      turno_id: params.turnoId ?? null,
      ip_address: ip,
      user_agent: ua,
    });
    if (error) {
      console.error("[controlados] no se pudo registrar la aceptación:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[controlados] error registrando la aceptación:", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * ¿Este usuario ya aceptó la versión vigente? Para el aviso del profesional.
 * Ante un error de lectura responde `true` (no molesta): mostrar el aviso de
 * más es peor que perder una oportunidad de pedirlo, que vuelve en la próxima
 * entrada.
 */
export async function aceptoControlados(userId: string): Promise<boolean> {
  if (esInstitucional()) return true;
  try {
    const id = await versionId();
    if (!id) return true;
    const { data, error } = await createAdminClient()
      .from("aceptaciones_legales")
      .select("id")
      .eq("user_id", userId)
      .eq("version_id", id)
      .limit(1)
      .maybeSingle();
    if (error) return true;
    return Boolean(data);
  } catch {
    return true;
  }
}
