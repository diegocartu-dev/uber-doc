// Plata REAL para el tablero — la regla de la casa (Diego 23/07):
// la comisión es 5% founders / 10% socios tradicionales, NUNCA fue $1.500 fija
// (eso era 5% × $30.000 que coincidía). Cobrado = lo que MP aprobó de verdad,
// no "precio de lista × atenciones" (el GMV teórico reescribe el pasado si el
// médico cambia su precio — caso Raphael 26/07: cobró $15.600 real y el
// tablero mostraba $8.000, su precio de lista del momento).
//
// LO DEVUELTO NO ES PLATA COBRADA (decisión Diego, 09/08/2026)
// Un reintegro NO toca `mp_status`: MP deja el pago en `approved` y la
// devolución queda registrada aparte, en `reintegro_estado`. Por eso una
// atención reembolsada seguía sumando al cobrado y el tablero mostraba plata
// que ya había salido. Ahora sale del cobrado y se informa como reintegro CON
// SU CAUSA, que es lo que permite distinguir un problema nuestro (el
// profesional no apareció) de uno del paciente.
//
// Ojo con el matiz: solo se descuenta lo REEMBOLSADO de verdad. Un reintegro
// en curso (`pendiente`) todavía no salió de ninguna cuenta; se informa aparte
// para que se vea la deuda, pero no se descuenta como si ya hubiera pasado.

export type FilaPago = {
  monto: number | null;
  mp_status: string | null;
  mp_application_fee: number | string | null;
  comision_docto_pct: number | string | null;
  /** Estado de la devolución. `null` = nunca hubo una. */
  reintegro_estado?: string | null;
  /** Por qué se resolvió así: `medico_ausente`, `paciente_ausente`, etc. */
  resolucion_motivo?: string | null;
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

/** MP aprobó el pago y sigue así. */
export const aprobada = (f: FilaPago): boolean => f.mp_status === "approved";

/**
 * La plata ya volvió al paciente.
 *
 * DOS SEÑALES, no una. Cuando el refund sale bien, el webhook de MP mueve
 * `mp_status` de `approved` a `refunded`; `reintegro_estado='reembolsado'` lo
 * escribe nuestro motor de reembolsos. Mirar una sola deja casos afuera:
 *   · solo `reintegro_estado` → se pierden las filas que MP ya marcó `refunded`
 *     (que son la mayoría de las reales).
 *   · solo `mp_status`        → se pierden las devoluciones que se ejecutaron
 *     sin que el webhook llegara. En este repo los webhooks fallados en
 *     silencio son un antecedente concreto, no una hipótesis.
 */
export const reintegrada = (f: FilaPago): boolean =>
  f.mp_status === "refunded" || f.reintegro_estado === "reembolsado";

/** Devolución iniciada que todavía no se concretó: deuda, no salida. */
export const reintegroEnCurso = (f: FilaPago): boolean =>
  !reintegrada(f) && !!f.reintegro_estado && f.reintegro_estado !== "reembolsado";

/**
 * Filas que movieron plata: la que entró y se quedó, y la que entró y volvió.
 *
 * Es el universo correcto para cualquier corte de plata. Filtrar por `aprobada`
 * antes de agrupar dejaba los reintegros afuera del cálculo — y el corte por
 * causa salía vacío justo cuando había devoluciones que mostrar.
 */
export const conMovimiento = (f: FilaPago): boolean => aprobada(f) || reintegrada(f);

/**
 * Plata efectivamente cobrada: aprobada y NO devuelta.
 *
 * Antes esto era solo `mp_status === "approved"`, y por eso una atención
 * reembolsada seguía figurando como ingreso.
 */
export const pagada = (f: FilaPago): boolean => aprobada(f) && !reintegrada(f);

export const cobradoDe = (filas: FilaPago[]): number =>
  filas.filter(pagada).reduce((s, f) => s + (Number(f.monto) || 0), 0);

export const comisionTotalDe = (filas: FilaPago[]): number =>
  filas.filter(pagada).reduce((s, f) => s + comisionDe(f), 0);

/** Total que volvió al paciente. */
export const reintegradoDe = (filas: FilaPago[]): number =>
  filas.filter(reintegrada).reduce((s, f) => s + (Number(f.monto) || 0), 0);

/** Total con devolución iniciada y todavía sin concretar. */
export const reintegroEnCursoDe = (filas: FilaPago[]): number =>
  filas.filter(reintegroEnCurso).reduce((s, f) => s + (Number(f.monto) || 0), 0);

/** Cómo se nombra cada causa en el tablero. Sin jerga de base de datos. */
const CAUSA_EN_CRIOLLO: Record<string, string> = {
  medico_ausente: "El profesional no llegó a atender",
  paciente_ausente: "El paciente no se presentó",
  cancelado_medico: "Lo canceló el profesional",
  cancelado_paciente: "Lo canceló el paciente",
  reprogramado: "Se reprogramó",
};

export function causaEnCriollo(motivo: string | null | undefined): string {
  if (!motivo) return "Sin causa registrada";
  return CAUSA_EN_CRIOLLO[motivo] ?? motivo;
}

export type ReintegroPorCausa = {
  causa: string;
  motivo: string;
  cantidad: number;
  monto: number;
};

/**
 * Los reintegros agrupados por su causa, de mayor a menor monto.
 *
 * Es el corte que importa: "el profesional no llegó a atender" es plata que
 * perdimos por una falla nuestra y se puede accionar; "lo canceló el paciente"
 * es costo normal de operar. Mezclarlos en un solo número los vuelve inútiles.
 */
export function reintegrosPorCausa(filas: FilaPago[]): ReintegroPorCausa[] {
  const acc = new Map<string, ReintegroPorCausa>();
  for (const f of filas.filter(reintegrada)) {
    const motivo = f.resolucion_motivo ?? "";
    const actual = acc.get(motivo) ?? {
      causa: causaEnCriollo(f.resolucion_motivo),
      motivo,
      cantidad: 0,
      monto: 0,
    };
    actual.cantidad += 1;
    actual.monto += Number(f.monto) || 0;
    acc.set(motivo, actual);
  }
  return [...acc.values()].sort((a, b) => b.monto - a.monto);
}
