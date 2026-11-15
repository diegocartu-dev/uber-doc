// Aprobación automática de profesionales (Diego, 13/11 y 15/11/2026).
//
// Diego, al aprobar, no mira ni la credencial ni la especialidad declarada: lo
// que decide son las dos fuentes oficiales. Entonces la ficha con REFEPS y
// biometría en verde se aprueba sola, y a él le quedan solo las que no cierran
// (biometría rechazada o en revisión, cruce de matrícula sin una única
// respuesta), que ya tienen su aviso.
//
// REGLA — se aprueba sola la ficha que cumple TODO esto:
//   · está en revisión (`pendiente_revision`), no es cuenta de prueba y el
//     profesional no se dio de baja;
//   · es de un médico (psicología: su apertura es una decisión aparte);
//   · la identidad quedó validada por biometría (`identidad_validada`, que solo
//     escribe `cerrarCruce` cuando el DNI de la biometría es el de la ficha y la
//     matrícula es una habilitada que REFEPS tiene para ese DNI) y Didit sigue
//     diciendo "Approved". La exención de biometría NO cuenta: es una decisión
//     manual y la aprobación de esa ficha también.
//   · REFEPS validado;
//   · el equipo nunca la rechazó ni la suspendió. Lo que una persona decidió no
//     lo deshace el sistema: esa ficha se aprueba a mano.
// Todo lo demás sigue como hasta hoy, con el botón «Aprobar» del panel.
//
// El registro crea la ficha recién con el formulario completo (credencial,
// firma, celular, términos) y la biometría es el último paso: una ficha en
// revisión con las dos fuentes en verde es un registro terminado.
//
// Solo B2C: en la instancia institucional el alta es provisionada.
//
// La llaman los tres caminos que validan la identidad (webhook de Didit, cron
// `reconciliar-identidad` y «Usar esta» del panel) y, de respaldo, el barrido
// del mismo cron (`aprobarPendientesEnVerde`), para la ficha que quedó en verde
// y no se aprobó en el momento.

import type { SupabaseClient } from "@supabase/supabase-js";
import { esInstitucional } from "@/lib/instancia";

/** Lo que queda en `verificado_por` y se ve en la ficha del panel. */
export const APROBADO_POR_SISTEMA = "Aprobación automática";

// Las mismas palabras que escribe el panel en `admin_audit_log`
// (`ADMIN_ACTIONS` en lib/admin-audit.ts, que no se importa acá porque arrastra
// `next/headers`). El test compara las dos listas.
export const ACCION_APROBAR = "aprobar_medico";
export const ACCIONES_QUE_FRENAN = ["rechazar_medico", "suspender_medico"] as const;

export interface FichaAprobacion {
  estado_registro: string | null;
  es_cuenta_test: boolean | null;
  dado_de_baja: boolean | null;
  profesion: string | null;
  identidad_validada: boolean | null;
  didit_status: string | null;
  refeps_validado: boolean | null;
}

export type MotivoNoAprobar =
  | "no_esta_en_revision"
  | "cuenta_de_prueba"
  | "se_dio_de_baja"
  | "otra_profesion"
  | "sin_biometria"
  | "sin_refeps"
  | "decision_previa_del_equipo";

export type Decision = { aprobar: true } | { aprobar: false; motivo: MotivoNoAprobar };

const no = (motivo: MotivoNoAprobar): Decision => ({ aprobar: false, motivo });

/**
 * La regla, pura. `accionesPrevias` son las acciones que el log de auditoría
 * tiene para esa ficha (rechazos, suspensiones, aprobaciones).
 */
export function decidirAprobacionAutomatica(ficha: FichaAprobacion, accionesPrevias: readonly string[]): Decision {
  if (ficha.estado_registro !== "pendiente_revision") return no("no_esta_en_revision");
  if (ficha.es_cuenta_test === true) return no("cuenta_de_prueba");
  if (ficha.dado_de_baja === true) return no("se_dio_de_baja");
  if (ficha.profesion !== "medico") return no("otra_profesion");
  if (ficha.identidad_validada !== true || ficha.didit_status !== "Approved") return no("sin_biometria");
  if (ficha.refeps_validado !== true) return no("sin_refeps");
  if (accionesPrevias.some((a) => (ACCIONES_QUE_FRENAN as readonly string[]).includes(a))) {
    return no("decision_previa_del_equipo");
  }
  return { aprobar: true };
}

export type ResultadoAprobacion =
  // `bienvenida`: si salió el mail de bienvenida en esta aprobación.
  | { aprobado: true; bienvenida: boolean }
  | {
      aprobado: false;
      motivo: MotivoNoAprobar | "instancia_institucional" | "no_se_pudo_leer" | "la_ficha_cambio" | "no_se_pudo_escribir";
    };

interface Dependencias {
  /** El mail de bienvenida de siempre. Inyectable para las pruebas. */
  enviarBienvenida: (medicoId: string) => Promise<void>;
}

const DEPENDENCIAS: Dependencias = {
  enviarBienvenida: async (medicoId) => {
    const { enviarEmailMedicoAprobado } = await import("@/lib/email");
    await enviarEmailMedicoAprobado(medicoId);
  },
};

/**
 * Aprueba la ficha si cumple la regla. No lanza nunca: quien la llama acaba de
 * validar una identidad, y eso no se puede caer por la aprobación (si algo
 * falla acá, el barrido del cron vuelve a mirar en la próxima pasada).
 *
 * `admin` es el cliente con la clave de servicio.
 */
export async function aprobarSiCorresponde(
  admin: SupabaseClient,
  medicoId: string,
  deps: Dependencias = DEPENDENCIAS
): Promise<ResultadoAprobacion> {
  if (esInstitucional()) return { aprobado: false, motivo: "instancia_institucional" };
  try {
    const { data, error: errFicha } = await admin
      .from("medicos")
      .select("estado_registro, es_cuenta_test, dado_de_baja, profesion, identidad_validada, didit_status, refeps_validado")
      .eq("id", medicoId)
      .single();
    const ficha = data as FichaAprobacion | null;
    if (errFicha || !ficha) {
      console.error("[aprobacion-automatica] no se pudo leer la ficha:", errFicha?.message);
      return { aprobado: false, motivo: "no_se_pudo_leer" };
    }
    // Primero lo que dice la ficha sola: la mayoría de las llamadas termina acá.
    const previa = decidirAprobacionAutomatica(ficha, []);
    if (!previa.aprobar) return { aprobado: false, motivo: previa.motivo };

    // Si no se puede leer el historial, no se aprueba: no saber no es "nunca
    // fue rechazada". La próxima pasada vuelve a mirar.
    const { data: historial, error: errHistorial } = await admin
      .from("admin_audit_log")
      .select("accion")
      .eq("recurso_tipo", "medico")
      .eq("recurso_id", medicoId)
      .in("accion", [ACCION_APROBAR, ...ACCIONES_QUE_FRENAN]);
    if (errHistorial || !historial) {
      console.error("[aprobacion-automatica] no se pudo leer el historial:", errHistorial?.message);
      return { aprobado: false, motivo: "no_se_pudo_leer" };
    }
    const acciones = (historial as Array<{ accion: string }>).map((h) => h.accion);
    const decision = decidirAprobacionAutomatica(ficha, acciones);
    if (!decision.aprobar) return { aprobado: false, motivo: decision.motivo };

    // Solo si la ficha sigue como se leyó: si en el medio alguien la rechazó,
    // la suspendió o la aprobó a mano, no se pisa.
    const { data: escritas, error: errEscritura } = await admin
      .from("medicos")
      .update({
        verificado: true,
        estado_registro: "aprobado",
        verificado_at: new Date().toISOString(),
        verificado_por: APROBADO_POR_SISTEMA,
      })
      .eq("id", medicoId)
      .eq("estado_registro", "pendiente_revision")
      .eq("profesion", "medico")
      .eq("dado_de_baja", false)
      .eq("identidad_validada", true)
      .eq("didit_status", "Approved")
      .eq("refeps_validado", true)
      .select("id");
    if (errEscritura) {
      console.error("[aprobacion-automatica] no se pudo aprobar:", errEscritura.message);
      return { aprobado: false, motivo: "no_se_pudo_escribir" };
    }
    if (!escritas?.length) return { aprobado: false, motivo: "la_ficha_cambio" };

    // El rastro, donde el profesional no puede escribir. Sin administrador: lo
    // hizo el sistema. Si falla, la aprobación ya está hecha y queda el log.
    const { error: errAudit } = await admin.from("admin_audit_log").insert({
      admin_user_id: null,
      accion: ACCION_APROBAR,
      recurso_tipo: "medico",
      recurso_id: medicoId,
      motivo: "Aprobación automática: REFEPS y biometría en verde",
      metadata: { actor: "sistema" },
    });
    if (errAudit) console.warn("[aprobacion-automatica] la aprobación no quedó en el log de auditoría:", errAudit.message);

    // La bienvenida, igual que en la aprobación a mano: una sola vez. Si ya
    // estuvo aprobado (volvió a revisión por un cambio de matrícula), no se repite.
    // Un mail que falla no cambia lo que pasó: la ficha ya está aprobada.
    let bienvenida = !acciones.includes(ACCION_APROBAR);
    if (bienvenida) {
      try {
        await deps.enviarBienvenida(medicoId);
      } catch (e) {
        bienvenida = false;
        console.error(`[aprobacion-automatica] aprobado sin bienvenida medico=${medicoId}:`, e instanceof Error ? e.message : String(e));
      }
    }

    console.log(`[aprobacion-automatica] aprobado medico=${medicoId} bienvenida=${bienvenida}`);
    return { aprobado: true, bienvenida };
  } catch (e) {
    console.error("[aprobacion-automatica] error inesperado:", e instanceof Error ? e.message : String(e));
    return { aprobado: false, motivo: "no_se_pudo_escribir" };
  }
}

const MAX_POR_PASADA = 25;

/**
 * Respaldo: las fichas en revisión que ya tienen las dos fuentes en verde y no
 * se aprobaron en el momento (la función murió, REFEPS se validó después, o
 * estaban así desde antes de esta regla). Lo corre el cron `reconciliar-identidad`.
 *
 * Las más nuevas primero: una ficha con una decisión previa del equipo queda en
 * esta lista para siempre (se aprueba a mano) y no puede taparle el lugar a la
 * que acaba de terminar.
 */
export async function aprobarPendientesEnVerde(
  admin: SupabaseClient,
  deps: Dependencias = DEPENDENCIAS
): Promise<{ revisadas: number; aprobadas: number }> {
  if (esInstitucional()) return { revisadas: 0, aprobadas: 0 };
  const { data, error } = await admin
    .from("medicos")
    .select("id")
    .eq("estado_registro", "pendiente_revision")
    .eq("profesion", "medico")
    .eq("dado_de_baja", false)
    .eq("identidad_validada", true)
    .eq("didit_status", "Approved")
    .eq("refeps_validado", true)
    .order("identidad_validada_at", { ascending: false })
    .limit(MAX_POR_PASADA);
  if (error) {
    console.error("[aprobacion-automatica] no se pudo buscar las fichas en verde:", error.message);
    return { revisadas: 0, aprobadas: 0 };
  }
  let aprobadas = 0;
  const ids = ((data ?? []) as Array<{ id: string }>).map((m) => m.id);
  for (const id of ids) {
    const r = await aprobarSiCorresponde(admin, id, deps);
    if (r.aprobado) aprobadas++;
  }
  return { revisadas: ids.length, aprobadas };
}
