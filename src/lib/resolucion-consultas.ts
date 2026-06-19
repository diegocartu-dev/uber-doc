// src/lib/resolucion-consultas.ts
//
// Motor de resolución de consultas/turnos (Fase 2).
// Función PURA y testeable: dadas señales OBJETIVAS de presencia, decide el
// estado terminal + la acción de plata. NO toca DB ni Mercado Pago — eso lo
// hacen los crons que la invocan (tolerancia-inicio, rejoin-expirar).
//
// Fuente de verdad de producto: DECISIONES_PRODUCTO_DOCTO.md §13
// Diseño: docs/diseno-resolucion-consultas.md §7.1 (árbol) y §11 (fallback conservador).
//
// Principio rector: la plataforma decide con SEÑALES OBJETIVAS (quién se conectó
// al video, si el paciente se presentó), nunca con la palabra del médico. Ante
// datos de presencia poco confiables se resuelve SIEMPRE a favor del paciente
// (reintegro) y SIN penalizar al médico.

export type MotivoResolucion =
  | "completada"
  | "no_show_paciente"
  | "medico_ausente"
  | "interrumpida";

export type AccionPlata = "ninguna" | "retener" | "refund";

export type SenalesResolucion = {
  /**
   * ¿El paciente se presentó?
   * - Turno: tiene una entrada en `sala_espera_entradas` (sin salida con motivo distinto de atendido).
   * - CI: por definición se presentó al pagar/entrar; es false solo si abandonó la
   *   sala de espera antes de que el médico entrara.
   */
  pacienteSePresento: boolean;
  /** ¿El médico se conectó alguna vez al video? (video_presencia rol='medico' evento='joined') */
  medicoEntroAlVideo: boolean;
  /** ¿El paciente se conectó alguna vez al video? (video_presencia rol='paciente' evento='joined') */
  pacienteEntroAlVideo: boolean;
  /**
   * ¿Confiamos en los datos de presencia de video? false si el webhook de LiveKit
   * pudo no haber registrado joined/left para este recurso (ver P-1 del diseño).
   * Ante datos no confiables NO se afirma "médico ausente": se resuelve a favor del
   * paciente como `interrumpida` con reintegro, sin penalizar al médico (§11).
   */
  presenciaConfiable: boolean;
  /**
   * ¿Hubo un corte detectado (`desconectado_at` seteado por el webhook) que no se
   * retomó? Distingue "se cortó la llamada y no volvieron" (interrumpida, reembolso)
   * de "ambos estuvieron, la sesión transcurrió, pero el médico no la finalizó
   * limpio" (completada, SIN reembolso — la consulta ocurrió). Sin esto, una
   * consulta atendida que no disparó room_finished se reembolsaría por error.
   */
  huboCorte: boolean;
};

export type Resolucion = {
  motivo: MotivoResolucion;
  accionPlata: AccionPlata;
  /** true si corresponde registrar la ausencia del médico en `ausencias_medico`. */
  registrarAusenciaMedico: boolean;
};

/**
 * Decide la resolución terminal de una consulta/turno que NO finalizó normalmente.
 *
 * El cierre normal lo hace `room_finished` (→ completada); a esta función llegan
 * solo los casos que un cron tuvo que resolver: el médico no apareció dentro de la
 * ventana, hubo un corte y nadie retomó, o el paciente no se presentó. Por eso el
 * caso "completada" es un default defensivo, no el camino esperado.
 */
export function resolver(s: SenalesResolucion): Resolucion {
  // 1. El paciente nunca se presentó → no-show. Se retiene el pago (requiere T&C).
  if (!s.pacienteSePresento) {
    return { motivo: "no_show_paciente", accionPlata: "retener", registrarAusenciaMedico: false };
  }

  // 2. El paciente se presentó. Si la presencia de video NO es confiable, no podemos
  //    afirmar que el médico estuvo ausente → resolvemos a favor del paciente
  //    (interrumpida + reintegro) y SIN penalizar al médico. (§11, fallback conservador.)
  if (!s.presenciaConfiable) {
    return { motivo: "interrumpida", accionPlata: "refund", registrarAusenciaMedico: false };
  }

  // 3. Presencia confiable y el médico nunca entró al video → médico ausente.
  //    Reintegro al paciente, sin penalización (se trackea en ausencias_medico).
  if (!s.medicoEntroAlVideo) {
    return { motivo: "medico_ausente", accionPlata: "refund", registrarAusenciaMedico: true };
  }

  // 4. El médico entró pero el paciente nunca se conectó al video (aunque figure
  //    "presentado" en sala de espera): caso borde. A favor del paciente →
  //    interrumpida + reintegro, sin penalizar al médico (estuvo presente).
  if (!s.pacienteEntroAlVideo) {
    return { motivo: "interrumpida", accionPlata: "refund", registrarAusenciaMedico: false };
  }

  // 5. Ambos estuvieron en el video. Dos sub-casos según si hubo un corte:
  //    a) hubo corte y no retomaron → interrumpida (reintegro/crédito, sin culpa).
  //    b) sin corte → la consulta TRANSCURRIÓ y solo no se finalizó limpio →
  //       completada, SIN reembolso (el médico atendió; reembolsar sería un error).
  if (s.huboCorte) {
    return { motivo: "interrumpida", accionPlata: "refund", registrarAusenciaMedico: false };
  }
  return { motivo: "completada", accionPlata: "ninguna", registrarAusenciaMedico: false };
}
