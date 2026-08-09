// Reservas abandonadas — el ruido que ningún reporte debe mostrar.
//
// MECANISMO (verificado en prod 06/08/2026):
// Cuando un paciente toma un turno, el slot pasa a estado 'reservado_pendiente'
// con `reservado_hasta` = ahora + ~15 min. Es una RETENCIÓN para darle tiempo a
// pagar (`reservarTurno` en src/app/clinica/[medicoId]/turnos/actions.ts). Si
// paga, el webhook de Mercado Pago lo deja 'confirmado' con mp_status='approved'.
// Si no paga, la retención vence y el lugar se libera — pero la liberación es
// PEREZOSA: la hace `limpiarReservasExpiradas` (mismo archivo, actions.ts:11),
// que solo corre cuando alguien abre el calendario de ese médico
// (CalendarioTurnos.tsx:42, en un useEffect de montaje). Hasta que eso pase, la
// fila queda en 'reservado_pendiente' con `reservado_hasta` en el PASADO, por
// horas o días.
//
// OJO: esa limpieza corre con el cliente RLS del visitante, así que puede no
// llegar a soltar el slot nunca (hay una rama aparte investigando justamente
// eso). Para este módulo da igual: la fila se descarta por su CONTENIDO
// (retención vencida y sin pago), no por confiar en que alguien la limpie.
//
// DECISIÓN DE PRODUCTO (Diego, 06/08/2026): "si la reserva fue por ese motivo
// perezoso y está liberado el turno, yo NO debo ver eso en los reportes.
// Guardalo en la base si querés, pero no es algo que nadie necesite ver: las
// vueltas que da un paciente indeciso."
// Caso que lo motivó: un paciente reservó las 14:30, se arrepintió, reservó las
// 15:00, se arrepintió, y finalmente reservó las 15:30 y pagó. El tablero
// mostraba TRES filas como si hubieran sido tres solicitudes: hubo UNA.
//
// Por eso: NO se borran de la base, NO se muestran ni se cuentan en NINGÚN
// reporte (tablero /insights y panel /admin).
//
// Una reserva VIVA (retención vigente, todavía sin pago acreditado) es distinta:
// es un pago en curso legítimo. Se puede LISTAR con etiqueta clara
// ("Reservando…"), pero no cuenta como actividad real — todavía no hay nada
// agendado ni cobrado. Para eso está `soloActividadReal`.

export const ESTADO_RESERVA_PENDIENTE = "reservado_pendiente";

/** Forma mínima de un turno para decidir si su reserva quedó abandonada. */
export type FilaReserva = {
  estado?: string | null;
  reservado_hasta?: string | null;
  mp_status?: string | null;
};

// Estados de Mercado Pago que significan "hubo plata de por medio": acreditada,
// autorizada o EN VUELO. Los medios offline (Rapipago, Pago Fácil,
// transferencia) quedan en 'pending'/'in_process' bastante más que los 15 min de
// la retención y recién después se acreditan: si solo mirásemos 'approved',
// esas reservas quedarían ocultas del tablero aunque el pago entre después.
// Hoy en prod los únicos mp_status que existen en `turnos` son 'approved' y
// 'refunded' (verificado 06/08/2026), así que esto es blindaje a futuro.
const MP_CON_PAGO = new Set(["approved", "authorized", "pending", "in_process", "in_mediation", "refunded"]);

const tienePagoEnJuego = (fila: FilaReserva): boolean =>
  !!fila.mp_status && MP_CON_PAGO.has(fila.mp_status);

/**
 * Reserva ABANDONADA = 'reservado_pendiente' + retención vencida + sin pago
 * (ni acreditado ni en vuelo). El paciente se arrepintió y el lugar ya está
 * libre a efectos prácticos.
 */
export function esReservaAbandonada(fila: FilaReserva): boolean {
  if (fila?.estado !== ESTADO_RESERVA_PENDIENTE) return false;
  // Pagó (o está pagando) y el webhook todavía no la pasó a 'confirmado': NO es
  // abandono, es un pago que puede acreditarse después.
  if (tienePagoEnJuego(fila)) return false;
  // Sin retención no hay pago en curso posible y la limpieza perezosa (que
  // filtra por `reservado_hasta < now()`) nunca la va a liberar: ruido puro.
  if (!fila.reservado_hasta) return true;
  const vence = Date.parse(String(fila.reservado_hasta));
  return !Number.isFinite(vence) || vence < Date.now();
}

/**
 * Reserva VIVA: retención vigente (o pago offline en vuelo) y todavía SIN pago
 * acreditado. Es el "Reservando…" que se puede listar pero no es actividad real:
 * no hay turno agendado ni plata cobrada.
 *
 * Una fila 'reservado_pendiente' con mp_status='approved' NO es viva: ya pagó y
 * el webhook está por pasarla a 'confirmado'. Cuenta como atención real (y su
 * plata, que ya estaba contada, sigue estándolo).
 */
export const esReservaViva = (fila: FilaReserva): boolean =>
  fila?.estado === ESTADO_RESERVA_PENDIENTE &&
  !esReservaAbandonada(fila) &&
  fila.mp_status !== "approved";

/** Saca del listado las reservas abandonadas. Deja pasar todo lo demás. */
export const sinReservasAbandonadas = <T extends FilaReserva>(filas: T[]): T[] =>
  filas.filter((f) => !esReservaAbandonada(f));

/**
 * Filas que cuentan como ACTIVIDAD REAL: sin abandonadas y sin reservas en
 * curso. Para KPIs y totales ("Atenciones", "Consultas hoy", total por médico o
 * especialidad), NO para listados — un listado puede mostrar la reserva viva con
 * su etiqueta.
 *
 * LA PLATA NO SE TOCA: ninguna de las dos exclusiones puede sacar una fila con
 * mp_status='approved' (abandonada exige que no haya pago; viva exige que no
 * esté approved), y todas las métricas de dinero filtran por 'approved'.
 */
export const soloActividadReal = <T extends FilaReserva>(filas: T[]): T[] =>
  filas.filter((f) => !esReservaAbandonada(f) && !esReservaViva(f));
