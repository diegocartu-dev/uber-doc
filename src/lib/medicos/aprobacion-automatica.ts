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
//   · la identidad quedó validada por biometría, CON EL CRUCE VIGENTE
//     (`identidad_validada_at` desde `CRUCE_VIGENTE_DESDE`), y Didit sigue
//     diciendo "Approved". Desde esa fecha `identidad_validada` solo lo escribe
//     `cerrarCruce`, cuando el DNI de la biometría es el de la ficha y la
//     matrícula es una de médico, habilitada, que REFEPS tiene para ese DNI. El
//     cruce anterior no miraba profesión ni habilitación: una identidad
//     validada antes no alcanza, y esa ficha se aprueba a mano. La exención de
//     biometría tampoco cuenta: es una decisión manual y la aprobación también.
//   · REFEPS validado;
//   · el equipo nunca la rechazó ni la suspendió. Lo que una persona decidió no
//     lo deshace el sistema: esa ficha se aprueba a mano.
// Todo lo demás sigue como hasta hoy, con el botón «Aprobar» del panel.
//
// El registro crea la ficha recién con el formulario completo (credencial,
// firma, celular, términos) y la biometría es el último paso: una ficha en
// revisión con las dos fuentes en verde es un registro terminado. (Una ficha
// anterior al 20/07/2026 puede no tener credencial o firma: se aprueba igual,
// y para ponerse disponible necesita el perfil completo como cualquiera.)
//
// Solo B2C: en la instancia institucional el alta es provisionada.
//
// La llaman los tres caminos que validan la identidad (webhook de Didit, cron
// `reconciliar-identidad` y «Usar esta» del panel) y, de respaldo, el barrido
// del mismo cron (`aprobarPendientesEnVerde`), para la ficha que quedó en verde
// y no se aprobó en el momento.

import type { SupabaseClient } from "@supabase/supabase-js";
import { esInstitucional } from "@/lib/instancia";

/**
 * Desde cuándo vale una identidad validada para aprobar sola: el cruce que
 * exige una matrícula de médico habilitada llegó a producción el 03/10/2026
 * por la mañana. Se toma el día siguiente entero.
 */
export const CRUCE_VIGENTE_DESDE = "2026-10-04T00:00:00-03:00";

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
  identidad_validada_at: string | null;
  didit_status: string | null;
  refeps_validado: boolean | null;
}

export type MotivoNoAprobar =
  | "no_esta_en_revision"
  | "cuenta_de_prueba"
  | "se_dio_de_baja"
  | "otra_profesion"
  | "sin_biometria"
  | "identidad_anterior_al_cruce"
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
  const validadaAt = ficha.identidad_validada_at ? Date.parse(ficha.identidad_validada_at) : NaN;
  if (!(validadaAt >= Date.parse(CRUCE_VIGENTE_DESDE))) return no("identidad_anterior_al_cruce");
  if (ficha.refeps_validado !== true) return no("sin_refeps");
  if (accionesPrevias.some((a) => (ACCIONES_QUE_FRENAN as readonly string[]).includes(a))) {
    return no("decision_previa_del_equipo");
  }
  return { aprobar: true };
}

export type ResultadoAprobacion =
  // `bienvenida`: si el mail de bienvenida salió de verdad en esta aprobación.
  | { aprobado: true; bienvenida: boolean }
  | {
      aprobado: false;
      motivo: MotivoNoAprobar | "instancia_institucional" | "no_se_pudo_leer" | "la_ficha_cambio" | "no_se_pudo_escribir";
    };

// Inyectables para las pruebas.
interface Dependencias {
  /** El mail de bienvenida de siempre. Devuelve si salió. */
  enviarBienvenida: (medicoId: string) => Promise<boolean>;
  /** Aviso al equipo: solo cuando un paso de la aprobación falla. */
  avisarEquipo: (asunto: string, texto: string) => Promise<void>;
}

const DEPENDENCIAS: Dependencias = {
  enviarBienvenida: async (medicoId) => {
    const { enviarEmailMedicoAprobado } = await import("@/lib/email");
    return enviarEmailMedicoAprobado(medicoId);
  },
  avisarEquipo: async (asunto, texto) => {
    const { sendDoctoAlert } = await import("@/lib/alertas");
    await sendDoctoAlert(asunto, texto);
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
      .select("estado_registro, es_cuenta_test, dado_de_baja, profesion, identidad_validada, identidad_validada_at, didit_status, refeps_validado")
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
      .gte("identidad_validada_at", CRUCE_VIGENTE_DESDE)
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
    // Un mail que no sale no cambia lo que pasó (la ficha ya está aprobada),
    // pero es un proceso que falló y acá no hay nadie mirando: suena.
    let bienvenida = false;
    if (!acciones.includes(ACCION_APROBAR)) {
      try {
        bienvenida = await deps.enviarBienvenida(medicoId);
      } catch (e) {
        console.error("[aprobacion-automatica] la bienvenida lanzó:", e instanceof Error ? e.message : String(e));
      }
      if (!bienvenida) {
        console.error(`[aprobacion-automatica] aprobado sin bienvenida medico=${medicoId}`);
        await deps
          .avisarEquipo(
            "Un profesional quedó aprobado y no le salió el mail de bienvenida",
            [
              "La aprobación automática aprobó a un profesional (REFEPS y biometría en verde),",
              "pero el mail de bienvenida no salió: no tiene mail cargado, los mails están",
              "apagados o falló el envío.",
              "",
              "¿Hay que hacer algo? Sí: avisarle que su cuenta ya está aprobada. En el panel",
              "(/admin/medicos, pestaña Aprobados) figura con «Verificado por: Aprobación automática».",
              "",
              "———",
              `Detalle técnico (para Claude): medico_id=${medicoId}.`,
            ].join("\n")
          )
          .catch(() => undefined);
      }
    }

    console.log(`[aprobacion-automatica] aprobado medico=${medicoId} bienvenida=${bienvenida}`);
    return { aprobado: true, bienvenida };
  } catch (e) {
    console.error("[aprobacion-automatica] error inesperado:", e instanceof Error ? e.message : String(e));
    return { aprobado: false, motivo: "no_se_pudo_escribir" };
  }
}

// Cuántas fichas se miran por pasada y cuántas se aprueban como mucho: mirar
// una que no corresponde son dos consultas; aprobar lleva además un mail.
const MAX_MIRADAS_POR_PASADA = 50;
const MAX_APROBADAS_POR_PASADA = 5;

/**
 * Respaldo: las fichas en revisión que ya tienen las dos fuentes en verde y no
 * se aprobaron en el momento (la función murió antes, REFEPS se validó
 * después). Lo corre el cron `reconciliar-identidad`.
 *
 * Las más nuevas primero. Una ficha con una decisión previa del equipo queda
 * en esta lista hasta que alguien la aprueba a mano: por eso se miran muchas y
 * se aprueban pocas, para que no le tapen el lugar a la que acaba de terminar.
 *
 * `hasta`: momento (ms) a partir del cual no se empieza otra ficha. El cron lo
 * usa para no pasarse de su tiempo: una función que muere entre el update y el
 * mail deja a alguien aprobado sin bienvenida, y eso ya no lo reintenta nadie.
 */
export async function aprobarPendientesEnVerde(
  admin: SupabaseClient,
  opciones: { hasta?: number } = {},
  deps: Dependencias = DEPENDENCIAS
): Promise<{ revisadas: number; aprobadas: number }> {
  if (esInstitucional()) return { revisadas: 0, aprobadas: 0 };
  const { data, error } = await admin
    .from("medicos")
    .select("id, es_cuenta_test")
    .eq("estado_registro", "pendiente_revision")
    .eq("profesion", "medico")
    .eq("dado_de_baja", false)
    .eq("identidad_validada", true)
    .gte("identidad_validada_at", CRUCE_VIGENTE_DESDE)
    .eq("didit_status", "Approved")
    .eq("refeps_validado", true)
    .order("identidad_validada_at", { ascending: false })
    .limit(MAX_MIRADAS_POR_PASADA);
  if (error) {
    console.error("[aprobacion-automatica] no se pudo buscar las fichas en verde:", error.message);
    return { revisadas: 0, aprobadas: 0 };
  }
  // `es_cuenta_test` admite NULL: se filtra acá y no en la consulta.
  const ids = ((data ?? []) as Array<{ id: string; es_cuenta_test: boolean | null }>)
    .filter((m) => m.es_cuenta_test !== true)
    .map((m) => m.id);
  let revisadas = 0;
  let aprobadas = 0;
  for (const id of ids) {
    if (aprobadas >= MAX_APROBADAS_POR_PASADA) break;
    if (opciones.hasta !== undefined && Date.now() >= opciones.hasta) break;
    revisadas++;
    const r = await aprobarSiCorresponde(admin, id, deps);
    if (r.aprobado) aprobadas++;
  }
  return { revisadas, aprobadas };
}
