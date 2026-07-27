// Plata REAL para el tablero — la regla de la casa (Diego 23/07):
// la comisión es 5% founders / 10% socios tradicionales, NUNCA fue $1.500 fija
// (eso era 5% × $30.000 que coincidía). Cobrado = lo que MP aprobó de verdad,
// no "precio de lista × atenciones" (el GMV teórico reescribe el pasado si el
// médico cambia su precio — caso Raphael 26/07: cobró $15.600 real y el
// tablero mostraba $8.000, su precio de lista del momento).

export type FilaPago = {
  monto: number | null;
  mp_status: string | null;
  mp_application_fee: number | string | null;
  comision_docto_pct: number | string | null;
};

/** Comisión real de una atención pagada: el fee que MP registró; si faltara,
 *  reconstruir por pct (5/10%); nunca inventar. */
export function comisionDe(f: FilaPago): number {
  const fee = Number(f.mp_application_fee);
  if (Number.isFinite(fee) && fee > 0) return fee;
  const pct = Number(f.comision_docto_pct);
  if (Number.isFinite(pct) && pct > 0 && f.monto) return (f.monto * pct) / 100;
  return 0;
}

export const pagada = (f: FilaPago): boolean => f.mp_status === "approved";

export const cobradoDe = (filas: FilaPago[]): number =>
  filas.filter(pagada).reduce((s, f) => s + (Number(f.monto) || 0), 0);

export const comisionTotalDe = (filas: FilaPago[]): number =>
  filas.filter(pagada).reduce((s, f) => s + comisionDe(f), 0);
