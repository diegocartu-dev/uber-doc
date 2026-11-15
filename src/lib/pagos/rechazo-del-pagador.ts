// ¿El rechazo de Mercado Pago es cosa del pagador, y no un proceso que falló?
//
// Regla del 06/10/2026: suenan los procesos que fallan, no lo que decide una
// persona. Diego, 15/11/2026: un rechazo por fondos insuficientes es del
// paciente (no le alcanza la plata en ese medio de pago) y no es para avisarle
// al equipo. El rechazo se sigue registrando igual, con su motivo, en
// `pago_rechazado` y en la atención: se describe, no suena.
//
// La lista es corta a propósito: solo lo que Diego dijo. Un motivo que no está
// acá suena, y también suena un rechazo que llega sin motivo.
const MOTIVOS_DEL_PAGADOR = new Set(["cc_rejected_insufficient_amount"]);

export function rechazoEsDelPagador(statusDetail: string | null | undefined): boolean {
  return MOTIVOS_DEL_PAGADOR.has((statusDetail ?? "").trim().toLowerCase());
}
