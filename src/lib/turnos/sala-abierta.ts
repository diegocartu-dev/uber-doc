// ¿Ya abrió la sala de espera de un turno? (16/10/2026)
//
// La sala abre 15 minutos antes de la hora del turno: la misma regla que ya usan
// el botón "Ir a sala de espera" del panel (MisTurnosPaciente) y de la
// confirmación. La sala en sí no la miraba: el mail de "Turno confirmado" trae
// el botón "Ir a la sala virtual", y una paciente que lo tocó al recibirlo, la
// noche anterior, quedó "esperando" 14 horas y al profesional le llegó "paciente
// esperando" a la noche.
//
// La hora del turno es argentina (UTC-3 fijo): se arma con el desfase explícito.

export const MINUTOS_ANTES_QUE_ABRE = 15;

/** true si falta MÁS de 15 minutos para el turno (la sala todavía no abrió). */
export function antesDeLaSala(fecha: string, horaInicio: string, ahoraMs: number = Date.now()): boolean {
  const hora = /^\d{2}:\d{2}(:\d{2})?$/.test(horaInicio) ? horaInicio.slice(0, 5) : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !hora) return false; // sin dato válido no se frena a nadie
  const inicioMs = Date.parse(`${fecha}T${hora}:00-03:00`);
  if (Number.isNaN(inicioMs)) return false;
  return inicioMs - ahoraMs > MINUTOS_ANTES_QUE_ABRE * 60_000;
}
