// Fechas y cobertura del tablero (regla 5 del manual: un mes en el que no se
// medía no aporta divisor ni se muestra como cero). Todo en fecha argentina
// "AAAA-MM-DD"; nada acá toca el DOM ni la base, así corre igual en el
// servidor, en el cliente y en el script de identidades.

import { sumarDiasAR } from "@/lib/insights/fechas";
import type { Cobertura, Periodo } from "./tipos";

/** Desde cuándo se mide cada cosa. Si aparece una unidad anterior a su fecha, la constante miente. */
export const COBERTURA: Cobertura = {
  ventana: "2026-04-01",
  lanzamiento: "2026-06-10",
  consultas: "2026-06-10",
  pacientes: "2026-04-01",
  embudo: "2026-06-22",
  oferta: "2026-06-10",
  hito: "2026-08-20",
  foto: "2026-07-28",
  triage: "2026-08-31",
  entrega: "2026-08-31",
};

export const ultimoDia = (mes: string): string => {
  const [y, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

export const diasEntre = (a: string, b: string): number =>
  Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000) + 1;

export const mesAnterior = (mes: string, k = 1): string => {
  let [y, m] = mes.split("-").map(Number);
  m -= k;
  while (m <= 0) {
    m += 12;
    y--;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
};

export const lunesDe = (fecha: string): string => {
  const d = new Date(fecha + "T12:00:00Z");
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
};

/** Los 12 meses que terminan en el mes de `hoy`. */
export const meses12 = (hoy: string): string[] => {
  const out: string[] = [];
  let [y, m] = hoy.slice(0, 7).split("-").map(Number);
  for (let i = 0; i < 12; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return out;
};

/** Días de ese mes cubiertos por una medición que existe desde `desde`, hasta `hoy`. */
export function diasCubiertosMes(mes: string, desde: string, hoy: string): number {
  const ini = mes + "-01" > desde ? mes + "-01" : desde;
  const fin = ultimoDia(mes) < hoy ? ultimoDia(mes) : hoy;
  return fin >= ini ? diasEntre(ini, fin) : 0;
}

export const cubierto = (mes: string, desde: string, hoy: string): boolean => diasCubiertosMes(mes, desde, hoy) > 0;

/** ¿La fecha cae en el período? Una sola definición para todas las unidades. */
export const enPer = (per: Periodo, fecha: string): boolean =>
  per.modo === "dias" ? fecha >= per.desde && fecha <= per.hasta : per.meses.has(fecha.slice(0, 7));

/** Días del período cubiertos por una medición que existe desde `cob`. */
export function diasCub(per: Periodo, cob: string, hoy: string): number {
  if (per.modo === "dias") {
    const ini = per.desde > cob ? per.desde : cob;
    const fin = per.hasta < hoy ? per.hasta : hoy;
    return fin >= ini ? diasEntre(ini, fin) : 0;
  }
  return [...per.meses].reduce((t, m) => t + diasCubiertosMes(m, cob, hoy), 0);
}

/** El período previo equivalente: mismo largo, inmediatamente antes. */
export function perPrev(per: Periodo): Periodo {
  if (per.modo === "dias") {
    const L = diasEntre(per.desde, per.hasta);
    return { modo: "dias", meses: new Set(), desde: sumarDiasAR(per.desde, -L), hasta: sumarDiasAR(per.desde, -1) };
  }
  const ms = [...per.meses].sort();
  const k = ms.length;
  return { modo: "meses", meses: new Set(Array.from({ length: k }, (_, i) => mesAnterior(ms[0], k - i))), desde: per.desde, hasta: per.hasta };
}

/** Primer día del período. */
export const perInicio = (per: Periodo): string => (per.modo === "dias" ? per.desde : [...per.meses].sort()[0] + "-01");

/** Los días del período que ya pasaron (hasta `hoy`). */
export function diasDelPeriodo(per: Periodo, hoy: string): string[] {
  const out: string[] = [];
  if (per.modo === "dias") {
    const fin = per.hasta < hoy ? per.hasta : hoy;
    for (let f = per.desde; f <= fin; f = sumarDiasAR(f, 1)) out.push(f);
    return out;
  }
  for (const m of [...per.meses].sort()) {
    const fin = ultimoDia(m) < hoy ? ultimoDia(m) : hoy;
    for (let f = m + "-01"; f <= fin; f = sumarDiasAR(f, 1)) out.push(f);
  }
  return out;
}

/** Métricas que se suman día a día (el script de identidades verifica rango = Σ días). */
export const ADITIVAS = ["n", "atendidas", "sinRespuesta", "retirados", "cobrado", "fee", "reintegrado", "pacsN", "busN", "busConProvN", "busConAlguienN", "busPago", "slotsN", "ciHoras", "pedidosCI"] as const;
