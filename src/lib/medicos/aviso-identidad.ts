// Avisos de identidad al profesional EN REVISIÓN (16/11/2026).
//
// Quien termina el registro y deja la verificación de identidad sin hacer, a
// medias, o con un resultado que Didit no aprobó, no recibía nada: el
// recordatorio que existía es para aprobados. Dos avisos:
//   - "falta":   no la empezó o no la terminó. A las 24 h del alta y después
//                cada 72 h, hasta los 30 días.
//   - "repetir": Didit no la aprobó (regla del 16/11: se hace de nuevo). Sale
//                en el momento en que Didit lo informa, y se repite cada 72 h
//                mientras no la rehaga.
// Qué le toca a cada uno lo decide `pasoIdentidad` (estado-identidad.ts). A
// quien espera algo de Docto (el cruce en revisión) no se le escribe: no puede
// hacer nada. Solo B2C; las cuentas de prueba no reciben avisos.
//
// El equipo deja de recibir un aviso por cada revisión o rechazo: suena recién
// cuando el mismo profesional falla en una segunda verificación (un proceso que
// no cierra), o cuando el mail al profesional no salió.

import type { SupabaseClient } from "@supabase/supabase-js";
import { esInstitucional } from "@/lib/instancia";
import { enviarEmailIdentidadEnRevision } from "@/lib/email";
import { pasoIdentidadDeFicha } from "./estado-identidad";

export type VarianteAviso = "falta" | "repetir";

const HORA_MS = 60 * 60 * 1000;
export const ESPERA_DESDE_EL_ALTA_MS = 24 * HORA_MS;
export const ENTRE_AVISOS_MS = 72 * HORA_MS;
export const INSISTE_HASTA_MS = 30 * 24 * HORA_MS;
/** Dos caminos (webhook y cron) pueden ver el mismo cambio: uno solo avisa. */
const VENTANA_DOBLE_AVISO_MS = 5 * 60 * 1000;
const MAX_POR_PASADA = 10;

export const ACCION_IDENTIDAD_A_REPETIR = "identidad_a_repetir";

const COLUMNAS =
  "id, estado_registro, es_cuenta_test, dado_de_baja, created_at, identidad_validada, biometria_exenta, didit_status, identidad_revision_motivo, identidad_recordatorio_at";

export interface FichaAviso {
  estado_registro: string | null;
  es_cuenta_test: boolean | null;
  dado_de_baja: boolean | null;
  created_at: string | null;
  identidad_validada: boolean | null;
  biometria_exenta: boolean | null;
  didit_status: string | null;
  identidad_revision_motivo: string | null;
  identidad_recordatorio_at: string | null;
}

/** ¿A esta ficha se le escribe por su identidad? (sin mirar plazos) */
function varianteQueLeToca(f: FichaAviso): VarianteAviso | null {
  if (f.estado_registro !== "pendiente_revision") return null;
  if (f.es_cuenta_test === true || f.dado_de_baja === true) return null;
  const paso = pasoIdentidadDeFicha(f);
  if (paso === "repetir") return "repetir";
  if (paso === "sin_empezar" || paso === "a_medias") return "falta";
  return null;
}

/** Qué aviso le toca AHORA a una ficha en revisión, o ninguno. Pura. */
export function decidirAvisoIdentidad(f: FichaAviso, ahoraMs: number): VarianteAviso | null {
  const variante = varianteQueLeToca(f);
  if (!variante) return null;
  const alta = f.created_at ? Date.parse(f.created_at) : NaN;
  if (Number.isNaN(alta) || ahoraMs - alta > INSISTE_HASTA_MS) return null;
  const ultimo = f.identidad_recordatorio_at ? Date.parse(f.identidad_recordatorio_at) : NaN;
  if (!Number.isNaN(ultimo) && ahoraMs - ultimo < ENTRE_AVISOS_MS) return null;
  // "Falta" no pisa el momento del registro: recién al día siguiente.
  if (variante === "falta" && ahoraMs - alta < ESPERA_DESDE_EL_ALTA_MS) return null;
  return variante;
}

/** Cuántas verificaciones distintas lleva sin aprobar, contando esta. Pura. */
export function contarIntentos(filas: Array<{ metadata: unknown }>, sesion: string): { intentos: number; yaRegistrado: boolean } {
  const sesiones = new Set<string>();
  for (const fila of filas) {
    const s = (fila.metadata as { sesion?: unknown } | null)?.sesion;
    if (typeof s === "string" && s) sesiones.add(s);
  }
  const yaRegistrado = sesiones.has(sesion);
  sesiones.add(sesion);
  return { intentos: sesiones.size, yaRegistrado };
}

export interface DepsAviso {
  enviar?: (medicoId: string, variante: VarianteAviso) => Promise<boolean>;
  ahora?: () => number;
}

/**
 * Reserva el aviso (un solo camino lo manda) y lo envía. Si el mail no sale,
 * suelta la reserva para que la pasada siguiente del cron lo reintente.
 */
async function reservarYEnviar(
  admin: SupabaseClient,
  medicoId: string,
  variante: VarianteAviso,
  ventanaMs: number,
  deps: DepsAviso
): Promise<boolean> {
  const ahora = (deps.ahora ?? Date.now)();
  const limite = new Date(ahora - ventanaMs).toISOString();
  const { data: reservada, error } = await admin
    .from("medicos")
    .update({ identidad_recordatorio_at: new Date(ahora).toISOString() })
    .eq("id", medicoId)
    .eq("identidad_validada", false)
    .or(`identidad_recordatorio_at.is.null,identidad_recordatorio_at.lt.${limite}`)
    .select("id");
  if (error) {
    console.error("[aviso-identidad] no se pudo reservar el aviso:", error.message);
    return false;
  }
  if (!reservada?.length) return false;
  const salio = await (deps.enviar ?? enviarEmailIdentidadEnRevision)(medicoId, variante);
  if (!salio) {
    const { error: errSoltar } = await admin.from("medicos").update({ identidad_recordatorio_at: null }).eq("id", medicoId);
    if (errSoltar) console.error("[aviso-identidad] no se pudo soltar la reserva del aviso:", errSoltar.message);
  }
  return salio;
}

/**
 * Didit acaba de informar que no aprobó la verificación `sesion`. Deja el
 * rastro del intento y, si la ficha está en revisión, le escribe al profesional
 * para que la haga de nuevo. Nunca lanza.
 *
 * `avisado` = el mail le salió ahora. `intentos` = verificaciones distintas que
 * lleva sin aprobar (1 si no se pudo contar: ante la duda no se inventa una
 * reincidencia).
 */
export async function avisarQueRepita(
  admin: SupabaseClient,
  medicoId: string,
  sesion: string,
  diditStatus: string,
  deps: DepsAviso = {}
): Promise<{ avisado: boolean; intentos: number }> {
  if (esInstitucional()) return { avisado: false, intentos: 1 };
  let intentos = 1;
  try {
    const { data: previas, error: errPrevias } = await admin
      .from("admin_audit_log")
      .select("metadata")
      .eq("accion", ACCION_IDENTIDAD_A_REPETIR)
      .eq("recurso_tipo", "medico")
      .eq("recurso_id", medicoId)
      .limit(100);
    if (errPrevias) {
      console.error("[aviso-identidad] no se pudo leer los intentos previos:", errPrevias.message);
    } else {
      const cuenta = contarIntentos(previas ?? [], sesion);
      intentos = cuenta.intentos;
      if (!cuenta.yaRegistrado) {
        const { error: errRastro } = await admin.from("admin_audit_log").insert({
          admin_user_id: null,
          accion: ACCION_IDENTIDAD_A_REPETIR,
          recurso_tipo: "medico",
          recurso_id: medicoId,
          motivo: "Didit no aprobó la verificación: el profesional la hace de nuevo",
          metadata: { actor: "sistema", sesion, didit_status: diditStatus },
        });
        if (errRastro) console.error("[aviso-identidad] el intento no quedó en el log de auditoría:", errRastro.message);
      }
    }

    const { data: ficha, error: errFicha } = await admin.from("medicos").select(COLUMNAS).eq("id", medicoId).maybeSingle();
    if (errFicha || !ficha) {
      console.error("[aviso-identidad] no se pudo leer la ficha:", errFicha?.message);
      return { avisado: false, intentos };
    }
    if (varianteQueLeToca(ficha as FichaAviso) !== "repetir") return { avisado: false, intentos };
    const avisado = await reservarYEnviar(admin, medicoId, "repetir", VENTANA_DOBLE_AVISO_MS, deps);
    return { avisado, intentos };
  } catch (e) {
    console.error("[aviso-identidad] avisarQueRepita falló:", e instanceof Error ? e.message : e);
    return { avisado: false, intentos };
  }
}

/**
 * Barrido del cron: a cada profesional en revisión le manda el aviso que le
 * toca, si le toca. Hasta 10 por pasada, los más antiguos primero.
 */
export async function avisarIdentidadPendientes(admin: SupabaseClient, deps: DepsAviso = {}): Promise<{ enviados: number }> {
  if (esInstitucional()) return { enviados: 0 };
  const ahora = (deps.ahora ?? Date.now)();
  const { data, error } = await admin
    .from("medicos")
    .select(COLUMNAS)
    .eq("estado_registro", "pendiente_revision")
    .eq("es_cuenta_test", false)
    .eq("identidad_validada", false)
    .gte("created_at", new Date(ahora - INSISTE_HASTA_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) {
    console.error("[aviso-identidad] no se pudo leer las fichas en revisión:", error.message);
    return { enviados: 0 };
  }
  let enviados = 0;
  for (const ficha of (data ?? []) as Array<FichaAviso & { id: string }>) {
    if (enviados >= MAX_POR_PASADA) break;
    const variante = decidirAvisoIdentidad(ficha, ahora);
    if (!variante) continue;
    if (await reservarYEnviar(admin, ficha.id, variante, ENTRE_AVISOS_MS, deps)) enviados++;
  }
  return { enviados };
}
