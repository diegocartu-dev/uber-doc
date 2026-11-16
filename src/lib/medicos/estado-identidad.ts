// En qué paso de la verificación de identidad está un profesional (16/11/2026).
//
// Única fuente de verdad de la pregunta "¿qué le toca hacer con su identidad?".
// La usan las dos pantallas de identidad del profesional, la columna del panel
// y `crear-sesion`: antes cada pantalla traducía el estado de Didit por su
// cuenta, y la de "en revisión" le decía «verificamos tu identidad
// correctamente» a quien Didit había dejado en duda, sin botón para repetirla.
//
// Regla (Diego, 16/11/2026): lo que Didit no aprueba solo —rechazo, revisión,
// duda— se hace de nuevo desde cero. Nadie lo decide a mano en la consola.
//
// Pura y sin imports de servidor: la importan componentes cliente.

export type PasoIdentidad =
  // Validada por biometría, o exenta: no le toca nada.
  | "habilitada"
  // Nunca empezó (o no hay sesión que valga): pantalla de inicio con el consentimiento.
  | "sin_empezar"
  // Empezó y no terminó. Según la documentación de Didit, devuelve la misma
  // sesión mientras no esté cerrada.
  | "a_medias"
  // Didit no la aprobó sola (rechazada, en revisión, o le pidieron repetir un
  // paso): la hace de nuevo.
  | "repetir"
  // Didit aprobó y falta que Docto cierre el cruce (segundos).
  | "procesando"
  // Didit aprobó, pero el cruce de Docto (DNI, matrícula de REFEPS) no cierra:
  // repetir la biometría no lo arregla. Lo resuelve el equipo en el panel.
  | "cruce_en_revision";

export interface EntradaPasoIdentidad {
  /** Identidad validada o exenta. */
  habilitada: boolean;
  /** `medicos.didit_status`. */
  diditStatus: string | null | undefined;
  /**
   * El "In Review" lo puso Docto (hay `identidad_revision_motivo`), no Didit.
   * A los componentes cliente les llega este booleano, nunca el texto del motivo.
   */
  revisionDeDocto: boolean;
}

export function pasoIdentidad(e: EntradaPasoIdentidad): PasoIdentidad {
  if (e.habilitada) return "habilitada";
  const s = (e.diditStatus ?? "").trim();
  if (s === "Approved") return "procesando";
  if (s === "In Review" || s === "Resubmitted") return e.revisionDeDocto ? "cruce_en_revision" : "repetir";
  if (s === "Declined") return "repetir";
  if (s === "In Progress" || s === "Abandoned" || s === "Expired") return "a_medias";
  return "sin_empezar";
}

/** Lo mismo, desde las columnas de la ficha (servidor). */
export function pasoIdentidadDeFicha(ficha: {
  identidad_validada?: boolean | null;
  biometria_exenta?: boolean | null;
  didit_status?: string | null;
  identidad_revision_motivo?: string | null;
}): PasoIdentidad {
  return pasoIdentidad({
    habilitada: ficha.identidad_validada === true || ficha.biometria_exenta === true,
    diditStatus: ficha.didit_status,
    revisionDeDocto: !!ficha.identidad_revision_motivo,
  });
}

/**
 * ¿El aviso de Didit es de la verificación vigente del profesional? La vigente
 * es la última que inició (`medicos.didit_session_id`). Una ficha sin sesión
 * guardada no descarta nada: no hay con qué comparar. El aviso de una sesión
 * anterior solo cuenta si Didit la aprobó (lo decide el webhook).
 */
export function esSesionVigente(sesionDeLaFicha: string | null | undefined, sesionDelAviso: string): boolean {
  const guardada = (sesionDeLaFicha ?? "").trim();
  if (!guardada) return true;
  return guardada === sesionDelAviso.trim();
}
