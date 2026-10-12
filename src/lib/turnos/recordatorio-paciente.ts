// Recordatorio al PACIENTE, 10 minutos antes del turno (arreglo 12/10/2026).
//
// POR QUÉ ESTÁ ACÁ: el cron de 10 minutos existía desde marzo pero nunca se
// agendó en vercel.json, y además comparaba la hora del servidor (UTC) contra la
// hora del turno (Argentina): aunque hubiera corrido, buscaba tres horas tarde.
// O sea que el aviso que el paciente eligió al reservar ("10 min") no le llegó
// nunca a nadie. Caso que lo destapó: un turno del 12/10 en que la profesional
// esperó y el paciente, que había pagado, no abrió la sala.
//
// La mayoría de los pacientes reserva el mismo día, así que el recordatorio de
// 24 horas no los alcanza: este es el que cuenta.
//
// Todo lo que decide va acá, puro y con test; el cron solo lee y manda.

/** Desde cuántos minutos antes del inicio se manda. */
export const AVISO_DESDE_MIN = 10.5;

/**
 * Minutos que faltan para que empiece el turno. `fecha` y `hora_inicio` están
 * en hora argentina (UTC-3 todo el año: Argentina no tiene horario de verano
 * desde 2009). Se arma el instante con el desfase explícito, así que el
 * resultado no depende de la zona del servidor.
 */
export function minutosParaElTurno(fecha: string, horaInicio: string, ahoraMs: number): number | null {
  const hora = horaInicio.length === 5 ? `${horaInicio}:00` : horaInicio.slice(0, 8);
  const inicio = Date.parse(`${fecha}T${hora}-03:00`);
  if (!Number.isFinite(inicio)) return null;
  return (inicio - ahoraMs) / 60_000;
}

/**
 * ¿Toca mandarlo en esta corrida? Desde los 10 minutos previos hasta el inicio.
 * La ventana se queda abierta hasta el inicio a propósito: si una corrida del
 * cron se saltea, la siguiente lo manda igual (con los minutos que de verdad
 * faltan). Que no salga dos veces lo garantiza la marca en la fila, no la
 * ventana.
 */
export function tocaRecordatorio10m(minutosQueFaltan: number | null): boolean {
  if (minutosQueFaltan === null) return false;
  return minutosQueFaltan > 0 && minutosQueFaltan <= AVISO_DESDE_MIN;
}

export type Preferencia = { quiere: boolean; email: boolean; push: boolean };

/**
 * Lo que el paciente eligió al reservar (`turnos.recordatorios`):
 * `cuando` = "24h,10m" | "10m" | "24h" | "" (o "todos", el valor por defecto
 * de la columna), `canal` = "ambos" | "email" | "notificaciones".
 * Sin dato se manda por los dos canales: es el valor por defecto de la columna
 * y el que la pantalla trae marcado.
 */
export function preferenciaRecordatorio10m(recordatorios: unknown): Preferencia {
  const r = (recordatorios && typeof recordatorios === "object" ? recordatorios : {}) as {
    cuando?: unknown;
    canal?: unknown;
  };
  const cuando = typeof r.cuando === "string" ? r.cuando.trim() : "todos";
  const quiere = cuando === "todos" || cuando.split(",").map((s) => s.trim()).includes("10m");
  const canal = typeof r.canal === "string" ? r.canal : "ambos";
  return {
    quiere,
    email: canal !== "notificaciones",
    push: canal !== "email",
  };
}

/**
 * Si el paciente eligió solo "Notificaciones Docto" y no tiene ninguna activa
 * (el push no llegó a ningún aparato), el aviso que pidió no le llegaría. Va
 * por mail: eligió un canal, no quedarse sin aviso.
 */
export function mandarMailDeRespaldo(pref: Preferencia, pushLlego: boolean): boolean {
  return !pref.email && pref.push && !pushLlego;
}

/** "en 10 minutos" / "en 1 minuto". Nunca "en 0". */
export function textoMinutos(minutosQueFaltan: number): string {
  const n = Math.max(1, Math.round(minutosQueFaltan));
  return n === 1 ? "1 minuto" : `${n} minutos`;
}
