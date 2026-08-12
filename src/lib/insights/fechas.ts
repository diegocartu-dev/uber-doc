// Helpers de fecha para el tablero. Argentina es UTC-3 FIJO (sin horario de
// verano), así que la conversión es un corrimiento constante de 3 horas.
//
// La trampa que motiva este módulo: comparar un `timestamptz` (UTC) contra una
// fecha argentina a secas ("2026-07-23") corta a las 21:00 ART del día
// ANTERIOR — una consulta de anoche se cuela en "hoy" y los buckets por día
// clasifican mal las de 21:00-24:00 ART.

/** Fecha de hoy (o hace `offset` días) en Argentina, como "AAAA-MM-DD". */
export function fechaAR(offset = 0): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  d.setDate(d.getDate() - offset);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Medianoche argentina de esa fecha, expresada en UTC — para comparar contra `timestamptz`. */
export const medianocheARenUTC = (fechaISO: string) => `${fechaISO}T03:00:00Z`;

/** Fecha argentina ("AAAA-MM-DD") de un instante ISO — para bucketear por día ART. */
export const fechaARdeISO = (iso: string) =>
  new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);

/**
 * Lunes de la semana argentina que contiene ese instante, como "AAAA-MM-DD"
 * ([NUEVO] spec institucional §6.4 — el "X de Y asignados esta semana" y el
 * acuerdo semanal cuentan por semana AR, de lunes a domingo).
 */
export function lunesDeSemanaAR(iso?: string): string {
  const base = iso ? fechaARdeISO(iso) : fechaAR();
  const d = new Date(base + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=domingo … 6=sábado
  const retroceso = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - retroceso);
  return d.toISOString().slice(0, 10);
}
