// Reservas abandonadas — el ruido que el tablero NO debe mostrar.
//
// MECANISMO (verificado en prod 06/08/2026):
// Cuando un paciente toma un turno, el slot pasa a estado 'reservado_pendiente'
// con `reservado_hasta` = ahora + ~15 min. Es una RETENCIÓN para darle tiempo a
// pagar (src/app/clinica/[medicoId]/turnos/actions.ts). Si paga, el webhook de
// Mercado Pago lo deja 'confirmado' con mp_status='approved'. Si no paga, la
// retención vence y el lugar se libera solo — pero la liberación es PEREZOSA:
// recién ocurre cuando alguien abre el calendario de ese médico (`liberarVencidos`
// en ese mismo archivo, disparado desde CalendarioTurnos.tsx). Hasta entonces la
// fila queda en 'reservado_pendiente' con `reservado_hasta` en el PASADO, por
// horas o días.
//
// DECISIÓN DE PRODUCTO (Diego, 06/08/2026): "si la reserva fue por ese motivo
// perezoso y está liberado el turno, yo NO debo ver eso en los reportes.
// Guardalo en la base si querés, pero no es algo que nadie necesite ver: las
// vueltas que da un paciente indeciso."
// Caso que lo motivó: un paciente reservó las 14:30, se arrepintió, reservó las
// 15:00, se arrepintió, y finalmente reservó las 15:30 y pagó. El tablero
// mostraba TRES filas como si hubieran sido tres solicitudes: hubo UNA.
//
// Por eso: NO se borran de la base, NO se muestran ni se cuentan en el tablero.
//
// Una reserva VIVA (retención todavía vigente) es distinta: es un pago en curso
// legítimo. Se puede listar con etiqueta clara ("reservando…"), pero tampoco
// cuenta como actividad real — todavía no hay nada agendado ni cobrado.

export const ESTADO_RESERVA_PENDIENTE = "reservado_pendiente";

/** Forma mínima de un turno para decidir si su reserva quedó abandonada. */
export type FilaReserva = {
  estado?: string | null;
  reservado_hasta?: string | null;
  mp_status?: string | null;
};

/**
 * Reserva ABANDONADA = 'reservado_pendiente' + retención vencida + sin pago
 * aprobado. El paciente se arrepintió (o nunca pagó) y el lugar ya está libre a
 * efectos prácticos: la limpieza perezosa lo va a soltar la próxima vez que
 * alguien abra ese calendario.
 */
export function esReservaAbandonada(fila: FilaReserva): boolean {
  if (fila?.estado !== ESTADO_RESERVA_PENDIENTE) return false;
  // Pagó pero el webhook todavía no la pasó a 'confirmado': NO es abandono.
  if (fila.mp_status === "approved") return false;
  // Sin retención no hay pago en curso posible y la limpieza perezosa (que
  // filtra por `reservado_hasta < now()`) nunca la va a liberar: ruido puro.
  if (!fila.reservado_hasta) return true;
  const vence = Date.parse(String(fila.reservado_hasta));
  return !Number.isFinite(vence) || vence < Date.now();
}

/** Reserva VIVA: retención vigente = pago en curso legítimo ("reservando…"). */
export const esReservaViva = (fila: FilaReserva): boolean =>
  fila?.estado === ESTADO_RESERVA_PENDIENTE && !esReservaAbandonada(fila);

/** Saca del listado las reservas abandonadas. Deja pasar todo lo demás. */
export const sinReservasAbandonadas = <T extends FilaReserva>(filas: T[]): T[] =>
  filas.filter((f) => !esReservaAbandonada(f));
