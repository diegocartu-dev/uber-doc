// Reloj de la Consulta Inmediata que NADIE aceptó todavía.
//
// El agujero que cierra (caso real 18/08/2026): una CI entró a las 22:09, el
// profesional no la tomó, y NADA la venció. `resolver-consultas-vencidas` sólo
// mira las PAGADAS, así que un pedido sin plata podía quedar en `esperando`
// para siempre. Consecuencias medidas esa noche:
//
//   · el paciente esperó frente a una sala que no iba a abrir (la solicitud
//     recién se cerró 11 h después, a mano, a la mañana siguiente);
//   · el profesional recibió 17 recordatorios de WhatsApp encadenados —incluidos
//     los de las 2, 3, 4, 5 y 6 de la mañana— porque el repush no tiene tope;
//   · el auto-apagado de disponibilidad de 4 h NO lo apagó: su guard trata
//     `esperando` como "está en medio de una atención, no lo cortes", cuando es
//     exactamente la señal contraria. Quedó "disponible ahora" en la cartilla
//     toda la madrugada, y era el único profesional online de su provincia.
//
// Regla de Diego (21/08/2026): 10 minutos y listo. Como máximo DOS avisos al
// profesional. Vencido el plazo se cancela el pedido, se libera al paciente
// —que ve la pantalla "Esta consulta no pudo concretarse · Buscar otro médico",
// ya existente, vía el polling de la sala— y al profesional se le apaga la CI.

/** Minutos desde la solicitud hasta que el pedido se cae solo. */
export const PLAZO_SIN_ACEPTAR_MIN = 10;

/** Minuto en el que sale el ÚNICO recordatorio (el aviso inicial es el otro). */
export const RECORDATORIO_MIN = 5;

/**
 * Tope de recordatorios por entrada de sala. El aviso inicial no cuenta acá: lo
 * manda `crearConsulta` en el instante del pedido. 1 + 1 = los dos avisos que
 * autorizó Diego.
 */
export const MAX_RECORDATORIOS = 1;

/** Motivo con el que se cierra la fila de la sala de espera. */
export const MOTIVO_SALIDA = "timeout_sistema";

/** Se escribe en `consultas.resolucion_motivo` — distingue este cierre del resto. */
export const RESOLUCION_MOTIVO = "no_aceptada";

export type Decision = "esperar" | "recordar" | "liberar";

/**
 * Qué hacer con una solicitud, según su edad y cuántos recordatorios ya salieron.
 *
 * Función pura a propósito: el reloj es la parte que hay que poder testear sin
 * base de datos ni cron.
 */
export function decidir(params: {
  /** Minutos transcurridos desde que el paciente pidió la consulta. */
  minutos: number;
  /** Recordatorios ya enviados por esta entrada de sala. */
  recordatoriosEnviados: number;
}): Decision {
  const { minutos, recordatoriosEnviados } = params;

  // El plazo manda sobre el recordatorio: si la solicitud ya venció no tiene
  // sentido avisar nada, se libera. (Importa cuando una corrida se saltea y el
  // cron encuentra el pedido con 12 minutos y cero recordatorios.)
  if (minutos >= PLAZO_SIN_ACEPTAR_MIN) return "liberar";

  if (minutos >= RECORDATORIO_MIN && recordatoriosEnviados < MAX_RECORDATORIOS) {
    return "recordar";
  }

  return "esperar";
}
