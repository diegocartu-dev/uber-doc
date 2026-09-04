// LA función que agrega (regla 2 del manual): todo número del tablero sale de
// `vista(datos, seleccion)`. Con un mes da exactamente ese mes; con un rango de
// días, ese rango; la ficha del profesional llama a la misma función con el
// filtro por profesional, así no puede divergir del ranking. Es pura: no toca
// el DOM ni la base, y por eso el script de identidades la corre contra las
// mismas unidades que ve la pantalla.
//
// Acá vive también el glosario (regla 12): un desenlace, un motivo y un estado
// tienen UNA sola palabra en todo el tablero.

import type { Atencion, Busqueda, DatosTablero, Filtros, Periodo, Seleccion } from "./tipos";
import { COBERTURA, diasCub, enPer } from "./cobertura";

export const SIN_LINEA = "había médicos pero ninguno en línea";
export const SIN_MED = "sin médicos para su provincia";
export const NADIE_ACEPTO = "eligió, nadie lo aceptó";
export const SIN_PROV = "sin provincia cargada";

/** Desenlace → [etiqueta, rol de color]. Los roles son de estado: ok / brand / aten / adv / neutro / ded. */
export const DES: Record<string, [string, string]> = {
  atendida: ["Atendida", "ok"],
  en_progreso: ["En curso", "brand"],
  paciente_se_fue: ["El paciente no llegó", "aten"],
  medico_se_fue: ["El profesional no sostuvo", "adv"],
  abandono: ["Aceptada, sin pagar", "neutro"],
  sin_datos: ["Cancelada, sin registro", "ded"],
  sin_respuesta: ["No la aceptó nadie", "adv"],
  retirado: ["El paciente se retiró", "neutro"],
};
export const ORDEN_DES = ["atendida", "en_progreso", "paciente_se_fue", "medico_se_fue", "abandono", "sin_datos"];

export const MOTIVO_LAB: Record<string, string> = {
  retiro_paciente: "El paciente se retiró",
  cambio_profesional: "Se fue con otro profesional",
  cancelo_profesional: "El profesional canceló",
  cancelacion_admin: "Cancelada por Docto",
  sin_respuesta_plazo: "Venció el plazo sin respuesta",
  motivo_libre: "Motivo escrito a mano",
  medico_ausente: "El profesional no llegó a atender",
  paciente_ausente: "El paciente no se presentó",
  cancelado_medico: "Lo canceló el profesional",
  cancelado_paciente: "Lo canceló el paciente",
  reprogramado: "Se reprogramó",
};

export const motivoDe = (a: Atencion): string =>
  (a.causa && MOTIVO_LAB[a.causa]) || a.causaTexto || DES[a.desenlace]?.[0] || a.desenlace;

export const ESTADO_LAB: Record<string, string> = {
  esperando: "Esperando profesional",
  aceptada: "Aceptada, sin pagar",
  pagada: "Pagada, por empezar",
  en_curso: "En curso",
  completada: "Completada",
  cancelada: "Cancelada",
  no_show_paciente: "Paciente ausente",
  medico_ausente: "Profesional ausente",
  interrumpida: "Interrumpida",
  reservando: "Pendiente de pago",
  confirmado: "Reservado y pago",
  en_espera: "Paciente en sala",
  completado: "Completado",
  ausente_paciente: "Paciente ausente",
  ausente_medico: "Profesional ausente",
  cancelado_paciente: "Canceló el paciente",
  cancelado_medico: "Canceló el profesional",
  reprogramado: "Reprogramado",
};

/** A qué vistas NO llega cada filtro: se declara, no se disimula. */
export const FILTRO_ALCANCE: Record<keyof Filtros, string | null> = {
  medico: "no alcanza a pacientes nuevos",
  esp: "no alcanza a pacientes nuevos",
  tipo: "no alcanza a pacientes nuevos",
  canal: "no alcanza a búsquedas ni pacientes nuevos",
  des: "no alcanza a búsquedas ni pacientes nuevos",
  motivo: "no alcanza a búsquedas ni pacientes nuevos",
  prov: null,
};

export const suma = <T>(arr: T[], k: keyof T | ((x: T) => number)): number =>
  arr.reduce((s, x) => s + (Number(typeof k === "function" ? k(x) : x[k]) || 0), 0);

/** Índices que cada vista necesita, construidos una vez por conjunto de datos. */
export type Indices = {
  provDe: (pacienteKey: string | null | undefined) => string | null;
  espDe: (medicoId: string) => string | null;
};

export function indices(D: DatosTablero): Indices {
  const prov = new Map(D.pacientes.map((p) => [p.key, p.provincia]));
  const esp = new Map(D.medicos.map((m) => [m.id, m.especialidad]));
  return {
    provDe: (k) => (k ? prov.get(k) ?? null : null),
    espDe: (id) => esp.get(id) ?? null,
  };
}

/** ¿La atención pasa los filtros acumulados? */
export function pasa(a: Atencion, f: Filtros, ix: Indices): boolean {
  if (f.tipo && a.tipo !== f.tipo) return false;
  if (f.canal && a.canal !== f.canal) return false;
  if (f.esp && a.especialidad !== f.esp) return false;
  if (f.medico && a.medicoId !== f.medico) return false;
  if (f.des && a.desenlace !== f.des) return false;
  if (f.prov && ix.provDe(a.paciente) !== f.prov) return false;
  if (f.motivo && motivoDe(a) !== f.motivo) return false;
  return true;
}

export type Vista = {
  per: Periodo;
  at: Atencion[];
  consultas: Atencion[];
  intentos: Atencion[];
  base: Atencion[];
  pacs: DatosTablero["pacientes"];
  bus: Busqueda[];
  slots: DatosTablero["slots"];
  ci: DatosTablero["ciHoras"];
  dias: { consultas: number; pacientes: number; embudo: number; oferta: number };
  n: number;
  atendidas: number;
  sinRespuesta: number;
  sinRespuestaDed: number;
  retirados: number;
  reservando: number;
  cobrado: number;
  fee: number;
  reintegrado: number;
  enCurso: number;
  cobradasN: number;
  pacsN: number;
  pacsConsultaron: number;
  busN: number;
  busConProvN: number;
  busSinProvN: number;
  busConAlguienN: number;
  busSinNadieN: number;
  busSinLinea: number;
  busSinLineaConAgenda: number;
  busSinMed: number;
  busNadieAcepto: number;
  liquidez: number | null;
  busEligio: number;
  busPidio: number;
  busPago: number;
  busAtendio: number;
  convServida: number | null;
  slotsN: number;
  slotsLibresFuturos: number;
  slotsVencidos: number;
  reservados: number;
  ciHoras: number;
  ciMedicos: number;
  pedidosCI: number;
  cobertura: number | null;
  celdas: number;
  totalCeldas: number;
  medicosVivos: number;
};

/** Todo lo que el tablero muestra sale de acá, para el período y los filtros de `sel`. */
export function vista(D: DatosTablero, sel: Seleccion, ix: Indices = indices(D)): Vista {
  const { per, f } = sel;
  const HOY = D.hoy;
  const enF = (fecha: string) => enPer(per, fecha);
  const at = D.atenciones.filter((a) => enF(a.fecha) && pasa(a, f, ix));
  const consultas = at.filter((a) => a.nivel === "consulta");
  const intentos = at.filter((a) => a.nivel === "intento");
  const base = sel.intentos ? at : consultas;
  const pacs = D.pacientes.filter((p) => enF(p.alta) && (!f.prov || p.provincia === f.prov));
  const bus = D.busquedas.filter(
    (b) =>
      enF(b.fecha) &&
      (!f.prov || b.provincia === f.prov) &&
      (!f.tipo || b.modo === f.tipo) &&
      (!f.medico || b.medicoElegidoId === f.medico) &&
      (!f.esp || (!!b.medicoElegidoId && ix.espDe(b.medicoElegidoId) === f.esp)),
  );
  const slots = D.slots.filter((s) => enF(s.fecha) && (!f.medico || s.medicoId === f.medico) && (!f.esp || ix.espDe(s.medicoId) === f.esp));
  const ci = D.ciHoras.filter((c) => enF(c.fecha) && (!f.medico || c.medicoId === f.medico) && (!f.esp || ix.espDe(c.medicoId) === f.esp));
  const C = D.cobertura;
  const d = { consultas: diasCub(per, C.consultas, HOY), pacientes: diasCub(per, C.pacientes, HOY), embudo: diasCub(per, C.embudo, HOY), oferta: diasCub(per, C.oferta, HOY) };
  const busConProv = bus.filter((b) => b.provincia);
  const busConAlguien = busConProv.filter((b) => b.matchHabia);
  const busPago = bus.filter((b) => b.pago || b.seAtendio);
  const cobradas = at.filter((a) => a.cobrado > 0);
  // Cobertura horaria: celdas (día, hora 8–22) con al menos un profesional en línea.
  const celdas = new Set(ci.filter((c) => c.hora >= 8 && c.hora <= 22 && c.horas > 0).map((c) => c.fecha + "|" + c.hora));
  const totalCeldas = d.oferta * 15;
  return {
    per, at, consultas, intentos, base, pacs, bus, slots, ci, dias: d,
    n: base.length,
    atendidas: base.filter((a) => a.desenlace === "atendida").length,
    sinRespuesta: intentos.filter((a) => a.desenlace === "sin_respuesta").length,
    sinRespuestaDed: intentos.filter((a) => a.desenlace === "sin_respuesta" && a.fecha < C.hito).length,
    retirados: intentos.filter((a) => a.desenlace === "retirado").length,
    reservando: at.filter((a) => a.estado === "reservando").length,
    cobrado: suma(at, "cobrado"),
    fee: suma(at, "fee"),
    reintegrado: suma(at, "reintegrado"),
    enCurso: suma(at, "reintegroEnCurso"),
    cobradasN: cobradas.length,
    pacsN: pacs.length,
    pacsConsultaron: pacs.filter((p) => p.consultas > 0).length,
    busN: bus.length,
    busConProvN: busConProv.length,
    busSinProvN: bus.length - busConProv.length,
    busConAlguienN: busConAlguien.length,
    busSinNadieN: busConProv.length - busConAlguien.length,
    busSinLinea: bus.filter((b) => b.resultado === SIN_LINEA).length,
    busSinLineaConAgenda: bus.filter((b) => b.resultado === SIN_LINEA && (b.agendaTurnos ?? 0) > 0).length,
    busSinMed: bus.filter((b) => b.resultado === SIN_MED).length,
    busNadieAcepto: bus.filter((b) => b.resultado === NADIE_ACEPTO).length,
    liquidez: busConProv.length ? (busConAlguien.length / busConProv.length) * 100 : null,
    busEligio: bus.filter((b) => b.eligio).length,
    busPidio: bus.filter((b) => b.pidio).length,
    busPago: busPago.length,
    busAtendio: bus.filter((b) => b.seAtendio).length,
    convServida: busConAlguien.length ? (busPago.length / busConAlguien.length) * 100 : null,
    slotsN: suma(slots, "n"),
    slotsLibresFuturos: suma(slots.filter((s) => s.fecha >= HOY), "libres"),
    slotsVencidos: suma(slots.filter((s) => s.fecha < HOY), "libres"),
    reservados: at.filter((a) => a.tipo === "turno" && a.pagada).length,
    ciHoras: suma(ci, "horas"),
    ciMedicos: new Set(ci.map((c) => c.medicoId)).size,
    pedidosCI: at.filter((a) => a.tipo === "ci").length,
    cobertura: totalCeldas ? (celdas.size / totalCeldas) * 100 : null,
    celdas: celdas.size,
    totalCeldas,
    medicosVivos: new Set([...ci.map((c) => c.medicoId), ...slots.map((s) => s.medicoId), ...at.map((a) => a.medicoId)]).size,
  };
}

export type Variacion = { texto: string; cls: "up" | "down" | "flat"; title: string } | null;

const fmtN = (n: number) => Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const fmtK = (n: number) => (Math.abs(n) >= 1000 ? "$" + fmtN(Math.round(n / 1000)) + "k" : "$" + fmtN(Math.round(n)));

/**
 * Variación justa (reglas 5 y 6 + criterio de Fede): tasas por día cubierto
 * contra el período previo equivalente; con menos de 10 casos en cualquiera
 * de los dos períodos, diferencia absoluta y sin color; el color aparece
 * solo si la diferencia supera 2·√(a+b). La plata juzga la base por cantidad
 * de consultas cobradas, no por pesos.
 */
export function variacion(
  valSel: number,
  diasSel: number,
  valPrev: number,
  diasPrev: number,
  { plata = false, nSel = 0, nPrev = 0 }: { plata?: boolean; nSel?: number; nPrev?: number } = {},
): Variacion {
  if (!diasSel || !diasPrev) return null;
  const prevEsc = (valPrev / diasPrev) * diasSel;
  const cSel = plata ? nSel : valSel;
  const cPrev = plata ? nPrev : valPrev;
  const cPrevEsc = (cPrev / diasPrev) * diasSel;
  if (cSel + cPrev === 0) return null;
  const dif = valSel - prevEsc;
  const title = `período previo, ${fmtN(diasPrev)} ${diasPrev === 1 ? "día" : "días"}: ${plata ? "$ " + fmtN(valPrev) : fmtN(valPrev)}`;
  const txt = plata ? `${dif >= 0 ? "+" : "−"}${fmtK(Math.abs(dif))}` : `${dif >= 0 ? "+" : "−"}${fmtN(Math.abs(Math.round(dif)))}`;
  if (cSel < 10 || cPrev < 10) {
    return { texto: Math.round(dif) === 0 ? "=" : (dif > 0 ? "▲ " : "▼ ") + txt, cls: "flat", title: title + " · base chica" };
  }
  const signif = Math.abs(cSel - cPrevEsc) > 2 * Math.sqrt(cSel + cPrevEsc);
  const v = prevEsc === 0 ? null : (dif / prevEsc) * 100;
  const cls = signif ? (dif > 0 ? "up" : "down") : "flat";
  return { texto: `${signif ? (dif > 0 ? "▲ " : "▼ ") : "= "}${v == null ? txt : fmtN(Math.abs(v)) + "%"}`, cls, title: title + (signif ? "" : " · dentro del ruido") };
}

/** Variación de una tasa (liquidez, conversión): puntos solo con ≥ 30 en el denominador y ≥ 5 éxitos en los dos períodos. */
export function varTasa(kSel: number, nSel: number, kPrev: number, nPrev: number): Variacion {
  if (!nPrev) return null;
  if (nSel < 30 || nPrev < 30 || kSel < 5 || kPrev < 5) {
    return { texto: `${fmtN(kPrev)} de ${fmtN(nPrev)} antes`, cls: "flat", title: `período previo: ${fmtN(kPrev)} de ${fmtN(nPrev)}` };
  }
  const d = (kSel / nSel - kPrev / nPrev) * 100;
  return { texto: `${d > 2 ? "▲ " : d < -2 ? "▼ " : "= "}${Math.abs(d).toLocaleString("es-AR", { maximumFractionDigits: 1 })} pts`, cls: d > 2 ? "up" : d < -2 ? "down" : "flat", title: `período previo: ${fmtN(kPrev)} de ${fmtN(nPrev)}` };
}

export { COBERTURA };
