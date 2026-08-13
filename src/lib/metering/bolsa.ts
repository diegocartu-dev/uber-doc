// src/lib/metering/bolsa.ts
// LA BOLSA DE HORAS — cuánto cumplió cada profesional de su acuerdo semanal
// (spec institucional §6.4, reglas operativas R7-R10). SOLO instancia
// institucional.
//
// ── LA REGLA, EN UNA FRASE ───────────────────────────────────────────────────
// "Los turnos valen por poner la agenda; las consultas inmediatas valen por
//  atender."
//
// Y en detalle (decisión de Diego, 12/08 — antes de eso la discusión estaba
// abierta entre dos lecturas malas):
//   · TURNOS: cuentan los slots levantados que YA TRANSCURRIERON, asignados o
//     no. Que la agenda se llene es gestión de la institución. Descuentan solo
//     los slots donde faltó el profesional y las agendas que él canceló.
//   · CONSULTAS INMEDIATAS: cada CI facturable suma UN bloque de la duración
//     configurada. Estar disponible sin atender a nadie no suma.
//
// Las dos lecturas que se descartaron, escritas acá para que no vuelvan por la
// ventana (y con test negativo cada una, en `clasificar.test.ts`):
//   ✗ CONSUMO puro (contar solo lo atendido): castiga al profesional por una
//     agenda que la institución no llenó.
//   ✗ DISPOSICIÓN total (contar todo lo levantado, sin descontar): le regala
//     las horas al que no apareció, que es exactamente lo que el acuerdo
//     tendría que detectar.
//
// ── EL DETALLE FINO: NADA SE CUENTA DOS VECES ────────────────────────────────
// Una CI atendida DENTRO de una franja de agenda propia ya transcurrida no
// suma bloque: esa hora ya está contada por disposición. Sin esta regla, el
// profesional que atiende una inmediata en su propio horario de turnos cobra
// la misma hora dos veces.

import { createAdminClient } from "@/lib/supabase/admin";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { fechaARdeISO, lunesDeSemanaAR } from "@/lib/insights/fechas";
import { leerTodo, leerTodoEnLotes } from "@/lib/metering/db";
import {
  ESTADOS_TERMINALES_CONSULTA,
  ESTADOS_TERMINALES_TURNO,
  type Motor,
} from "@/lib/metering/clasificar";

// ─────────────────────────────────────────────────────────────────────────────
// EL NÚCLEO PURO
// ─────────────────────────────────────────────────────────────────────────────

export interface SlotDisposicion {
  /**
   * Identidad del HUECO de agenda, no de la fila: "medicoId|fecha|hora".
   *
   * Existe porque un mismo horario puede aparecer DOS VECES en `turnos`: el
   * turno reprogramado queda como fila terminal y su horario vuelve a la
   * oferta como slot disponible. Son dos filas y una sola hora de agenda
   * puesta; contar las dos inflaría el cumplimiento con un turno que se movió.
   */
  clave: string;
  /** Dueño de la franja. Se usa para no cruzar la CI de uno con la agenda de otro. */
  medicoId?: string;
  inicioMs: number;
  finMs: number;
  /** ¿Este slot DESCUENTA? (ausencia del profesional o agenda cancelada por él) */
  descuenta: boolean;
}

export interface CIAtendida {
  medicoId?: string;
  /** Instante de la consulta (asignación): decide si cayó dentro de una franja propia. */
  inicioMs: number;
}

export interface EntradaBolsa {
  /** `slot_duracion_min` del config: la fija la institución, no el profesional (R10). */
  duracionSlotMin: number;
  horasComprometidas: number;
  slots: SlotDisposicion[];
  cis: CIAtendida[];
}

export interface ResultadoBolsa {
  minutosTurnos: number;
  minutosCI: number;
  minutosCumplidos: number;
  minutosComprometidos: number;
  /** Entero 0-100 (o más, si superó el acuerdo). 0 si no hay acuerdo. */
  porcentaje: number;
  slotsContados: number;
  slotsDescontados: number;
  cisContadas: number;
  cisDentroDeFranja: number;
}

/**
 * La bolsa de un profesional (o de un conjunto, si el caller ya mezcló: las
 * claves y los `medicoId` mantienen todo separado).
 *
 * Los minutos de turno salen de la DURACIÓN REAL de cada slot y no de
 * `duracionSlotMin`: si una agenda vieja quedó con slots de 20 minutos y la
 * institución después bajó la duración a 15, lo que el profesional puso a
 * disposición fueron 20. `duracionSlotMin` manda solo en el bloque de la CI,
 * que es donde la regla lo define explícitamente.
 */
export function calcularBolsa(entrada: EntradaBolsa): ResultadoBolsa {
  // 1) Deduplicar slots por hueco de agenda. Si CUALQUIERA de las filas de ese
  //    hueco descuenta, el hueco descuenta: una ausencia no se lava porque el
  //    horario haya vuelto a la oferta después.
  const huecos = new Map<string, SlotDisposicion>();
  for (const s of entrada.slots) {
    const previo = huecos.get(s.clave);
    if (!previo) {
      huecos.set(s.clave, { ...s });
    } else if (s.descuenta) {
      previo.descuenta = true;
    }
  }

  let minutosTurnos = 0;
  let slotsContados = 0;
  let slotsDescontados = 0;
  const contadas: SlotDisposicion[] = [];
  for (const s of huecos.values()) {
    if (s.descuenta) {
      slotsDescontados++;
      continue;
    }
    const minutos = Math.max(0, Math.round((s.finMs - s.inicioMs) / 60_000));
    minutosTurnos += minutos;
    slotsContados++;
    contadas.push(s);
  }

  // 2) Las CI, en bloques — salvo las que cayeron dentro de una franja propia
  //    ya contada por disposición.
  let cisContadas = 0;
  let cisDentroDeFranja = 0;
  for (const ci of entrada.cis) {
    const adentro = contadas.some(
      (s) => s.medicoId === ci.medicoId && ci.inicioMs >= s.inicioMs && ci.inicioMs < s.finMs
    );
    if (adentro) cisDentroDeFranja++;
    else cisContadas++;
  }
  const minutosCI = cisContadas * entrada.duracionSlotMin;

  const minutosCumplidos = minutosTurnos + minutosCI;
  const minutosComprometidos = Math.round(entrada.horasComprometidas * 60);
  // Sin acuerdo cargado no se inventa un porcentaje: 0, nunca NaN ni Infinity
  // (un NaN en el panel es un "—" en el mejor caso y un 100 % en el peor).
  const porcentaje =
    minutosComprometidos > 0 ? Math.round((minutosCumplidos / minutosComprometidos) * 100) : 0;

  return {
    minutosTurnos,
    minutosCI,
    minutosCumplidos,
    minutosComprometidos,
    porcentaje,
    slotsContados,
    slotsDescontados,
    cisContadas,
    cisDentroDeFranja,
  };
}

/** Minutos → horas con un decimal (29,5). Para mostrar, no para calcular. */
export function minutosAHoras(minutos: number): number {
  return Math.round((minutos / 60) * 10) / 10;
}

/** "1 h" · "45 min" · "1 h 30 min" · "—" — el formato de la tabla del panel. */
export function etiquetaHoras(minutos: number): string {
  if (minutos <= 0) return "—";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export type BadgeCumplimiento = "Cumplido" | "En curso" | "Incompleto" | "Sin actividad";

/**
 * El badge del profesional en la tabla del panel.
 *
 * ── R30, LA REGLA QUE NO SE NEGOCIA ──────────────────────────────────────────
 * Mientras la semana está ABIERTA nadie figura como "Incompleto". Decirle
 * "incompleto" un miércoles a alguien que tiene hasta el domingo no es
 * información: es un reproche con datos incompletos, y este panel informa, no
 * escracha. Recién al cerrar la semana el estado se vuelve definitivo.
 */
export function badgeCumplimiento(
  minutosCumplidos: number,
  minutosComprometidos: number,
  semanaCerrada: boolean
): BadgeCumplimiento {
  if (minutosComprometidos > 0 && minutosCumplidos >= minutosComprometidos) return "Cumplido";
  if (minutosCumplidos <= 0) return "Sin actividad";
  return semanaCerrada ? "Incompleto" : "En curso";
}

// ─────────────────────────────────────────────────────────────────────────────
// LA SEMANA AR
// ─────────────────────────────────────────────────────────────────────────────

/** Los siete días de la semana AR que arranca ese lunes, como "AAAA-MM-DD". */
export function diasDeSemana(lunesAr: string): string[] {
  const out: string[] = [];
  const base = new Date(`${lunesAr}T12:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Domingo de esa semana. */
export function domingoDeSemana(lunesAr: string): string {
  return diasDeSemana(lunesAr)[6];
}

/** Lunes de la semana anterior a la de ese lunes (o a la de hoy). */
export function semanaAnterior(lunesAr: string): string {
  const d = new Date(`${lunesAr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana siguiente. */
export function semanaSiguiente(lunesAr: string): string {
  const d = new Date(`${lunesAr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/** ¿Esa semana ya terminó? (el domingo a medianoche AR ya pasó) */
export function semanaTerminada(lunesAr: string, ahoraMs = Date.now()): boolean {
  const finMs = Date.parse(`${domingoDeSemana(lunesAr)}T23:59:59-03:00`);
  return ahoraMs > finMs;
}

/** "19 al 25 de octubre" — el título del selector de semana del panel. */
export function etiquetaSemana(lunesAr: string): string {
  const domingo = domingoDeSemana(lunesAr);
  const mesDe = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", { month: "long", timeZone: "UTC" });
  const diaDe = (iso: string) => Number(iso.slice(8, 10));
  const mesL = mesDe(lunesAr);
  const mesD = mesDe(domingo);
  return mesL === mesD
    ? `${diaDe(lunesAr)} al ${diaDe(domingo)} de ${mesD}`
    : `${diaDe(lunesAr)} de ${mesL} al ${diaDe(domingo)} de ${mesD}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA CÁSCARA — cumplimiento real de una semana, contra la base
// ─────────────────────────────────────────────────────────────────────────────

export interface CumplimientoProfesional {
  medicoId: string;
  nombre: string;
  especialidad: string;
  horasComprometidas: number;
  minutosComprometidos: number;
  minutosCumplidos: number;
  minutosTurnos: number;
  minutosCI: number;
  porcentaje: number;
  motores: Record<Motor, number>;
  badge: BadgeCumplimiento;
  /** true = la semana está sellada en `acuerdo_semanas` (los números no se recalculan). */
  sellada: boolean;
}

/** Fila de `acuerdo_semanas` tal como la lee el panel (el sello de esa semana). */
interface SemanaSellada {
  medico_id: string;
  horas_comprometidas: number | string;
  minutos_cumplidos: number | string;
  desglose_motores: { turnos?: number; ci?: number; motores?: Record<Motor, number> } | null;
  estado: string;
}

/** Estados de turno que DESCUENTAN de la disposición (§6.4). */
const ESTADOS_QUE_DESCUENTAN = new Set(["ausente_medico", "cancelado_medico"]);

/** "2026-10-20" + "16:30:00" → epoch ms en AR (offset fijo -03:00). */
function msAR(fecha: string, hora: string | null): number {
  const h = (hora ?? "00:00:00").length === 5 ? `${hora}:00` : (hora ?? "00:00:00").slice(0, 8);
  return Date.parse(`${fecha}T${h}-03:00`);
}

const MOTORES_VACIOS = (): Record<Motor, number> => ({ acordado: 0, espontaneo: 0, ofrecido: 0 });

/**
 * Cumplimiento de TODOS los profesionales del piloto en esa semana.
 *
 * Semana cerrada → se leen los números sellados en `acuerdo_semanas` (no se
 * recalculan: para eso se sellaron). Semana abierta → se calcula al vuelo, que
 * con 30 profesionales cuesta cuatro queries.
 *
 * Orden ALFABÉTICO, como manda el mock: el panel informa, no arma un ranking.
 *
 * ── TIRA SI LA BASE FALLA ────────────────────────────────────────────────────
 * Todas las lecturas van por `leerTodo` (paginado + error propagado). Antes se
 * destructuraba solo `data`: si fallaba la primera —el universo— la función
 * devolvía `[]` sin decir nada, y `cerrarSemana` sellaba CERO filas reportando
 * éxito. Como el cron sella siempre la semana anterior y nunca reintenta, esa
 * semana se quedaba sin sellar para siempre con el watchdog en verde.
 */
export async function cumplimientoDeSemana(params: {
  semanaAr: string;
  ahoraMs?: number;
}): Promise<CumplimientoProfesional[]> {
  const admin = createAdminClient();
  const config = await getConfigInstitucion();
  const ahoraMs = params.ahoraMs ?? Date.now();
  const lunes = params.semanaAr;
  const domingo = domingoDeSemana(lunes);

  // ── 1) Los sellos de esta semana ───────────────────────────────────────────
  // Van PRIMERO y sin filtrar por el padrón de hoy, porque son la mitad del
  // universo. Antes se leían con `.in('medico_id', ids)` sobre el padrón vivo:
  // el profesional que dejaba el piloto (o cuya especialidad salía del config)
  // desaparecía de una semana YA CERRADA, y como el KPI de cumplimiento suma
  // sobre las filas listadas, el 98 % de octubre cambiaba solo. Justo lo que la
  // 015 promete que no puede pasar: "lo que la institución vio el lunes tiene
  // que seguir diciendo lo mismo en diciembre".
  const selladas = await leerTodo<SemanaSellada>("sellos de la semana", (desde, hasta) =>
    admin
      .from("acuerdo_semanas")
      .select("medico_id, horas_comprometidas, minutos_cumplidos, desglose_motores, estado")
      .eq("semana_ar", lunes)
      .eq("estado", "cerrada")
      .order("medico_id", { ascending: true })
      .range(desde, hasta)
  );
  const selladaPorMedico = new Map<string, SemanaSellada>();
  for (const s of selladas) selladaPorMedico.set(s.medico_id, s);

  // ── 2) El universo: el padrón de HOY ∪ los que tienen sello esa semana ─────
  const medicos = await leerTodo<Record<string, unknown>>(
    "padrón de profesionales del piloto",
    (desde, hasta) =>
      admin
        .from("medicos")
        .select("id, nombre_completo, titulo, especialidad")
        .eq("estado_registro", "aprobado")
        .in("especialidad", config.especialidades)
        .order("id", { ascending: true })
        .range(desde, hasta)
  );
  const enElPadron = new Set(medicos.map((m) => m.id as string));
  // A los sellados que ya no están en el padrón se les busca el nombre igual:
  // su fila tiene que seguir en la tabla, con el número que se selló.
  const selladosFuera = [...selladaPorMedico.keys()].filter((id) => !enElPadron.has(id));
  const medicosFuera = await leerTodoEnLotes<Record<string, unknown>>(
    "profesionales con semana sellada fuera del padrón",
    selladosFuera,
    (lote, desde, hasta) =>
      admin
        .from("medicos")
        .select("id, nombre_completo, titulo, especialidad")
        .in("id", lote)
        .order("id", { ascending: true })
        .range(desde, hasta)
  );

  const universo = [...medicos, ...medicosFuera].map((m) => ({
    id: m.id as string,
    nombre: `${((m.titulo as string | null) ?? "").trim()} ${((m.nombre_completo as string | null) ?? "").trim()}`.trim(),
    especialidad: (m.especialidad as string | null) ?? "",
  }));
  if (universo.length === 0) return [];
  const ids = universo.map((m) => m.id);

  // ── 3) Acuerdo vigente ESA semana (no hoy: la semana puede ser vieja) ──────
  // El lote nunca parte a un profesional al medio, así que el "gana el
  // `vigente_desde` más nuevo" de abajo sigue viendo todos los acuerdos de cada
  // uno juntos y en orden.
  const acuerdos = await leerTodoEnLotes<Record<string, unknown>>(
    "acuerdos de servicio vigentes",
    ids,
    (lote, desde, hasta) =>
      admin
        .from("acuerdos_servicio")
        .select("medico_id, horas_semanales, vigente_desde, vigente_hasta")
        .in("medico_id", lote)
        .lte("vigente_desde", domingo)
        .or(`vigente_hasta.is.null,vigente_hasta.gte.${lunes}`)
        .order("vigente_desde", { ascending: false })
        .order("id", { ascending: false })
        .range(desde, hasta)
  );
  const horasPorMedico = new Map<string, number>();
  for (const a of acuerdos) {
    if (!horasPorMedico.has(a.medico_id as string)) {
      horasPorMedico.set(a.medico_id as string, Number(a.horas_semanales));
    }
  }

  // ── 4) Disposición: los slots de agenda de la semana que ya transcurrieron ─
  const turnos = await leerTodoEnLotes<Record<string, unknown>>(
    "slots de agenda de la semana",
    ids,
    (lote, desde, hasta) =>
      admin
        .from("turnos")
        .select("id, medico_id, fecha, hora_inicio, hora_fin, estado, canal_origen")
        .in("medico_id", lote)
        .gte("fecha", lunes)
        .lte("fecha", domingo)
        .in("canal_origen", ["acordado", "ofrecido"])
        .order("id", { ascending: true })
        .range(desde, hasta)
  );

  const slotsPorMedico = new Map<string, SlotDisposicion[]>();
  for (const t of turnos) {
    const inicioMs = msAR(t.fecha as string, t.hora_inicio as string);
    const finMs = msAR(t.fecha as string, t.hora_fin as string);
    // Solo lo TRANSCURRIDO: una agenda de mañana todavía no es una hora puesta.
    if (!Number.isFinite(finMs) || finMs > ahoraMs) continue;
    const medicoId = t.medico_id as string;
    const lista = slotsPorMedico.get(medicoId) ?? [];
    lista.push({
      clave: `${medicoId}|${t.fecha}|${String(t.hora_inicio).slice(0, 5)}`,
      medicoId,
      inicioMs,
      finMs,
      descuenta: ESTADOS_QUE_DESCUENTAN.has(t.estado as string),
    });
    slotsPorMedico.set(medicoId, lista);
  }

  // ── 5) Atención: las CI facturables de la semana, del contador ─────────────
  const filasMetering = await leerTodoEnLotes<Record<string, unknown>>(
    "encuentros facturables de la semana",
    ids,
    (lote, desde, hasta) =>
      admin
        .from("encuentros_metering")
        .select("tipo, recurso_id, medico_id, motor, clasificacion")
        .eq("semana_ar", lunes)
        .eq("clasificacion", "facturable")
        .in("medico_id", lote)
        .order("id", { ascending: true })
        .range(desde, hasta)
  );

  const motoresPorMedico = new Map<string, Record<Motor, number>>();
  const idsCI: string[] = [];
  const medicoDeCI = new Map<string, string>();
  for (const f of filasMetering) {
    const medicoId = f.medico_id as string;
    const m = motoresPorMedico.get(medicoId) ?? MOTORES_VACIOS();
    m[f.motor as Motor]++;
    motoresPorMedico.set(medicoId, m);
    if (f.tipo === "consulta") {
      idsCI.push(f.recurso_id as string);
      medicoDeCI.set(f.recurso_id as string, medicoId);
    }
  }

  // El instante de la CI decide si cayó dentro de una franja propia. Sale de
  // `consultas`, no del contador: ahí está el dato exacto de cuándo se asignó.
  const cisPorMedico = new Map<string, CIAtendida[]>();
  const consultas = await leerTodoEnLotes<Record<string, unknown>>(
    "instantes de las consultas inmediatas",
    idsCI,
    (lote, desde, hasta) =>
      admin
        .from("consultas")
        .select("id, medico_id, asignada_at, created_at")
        .in("id", lote)
        .order("id", { ascending: true })
        .range(desde, hasta)
  );
  for (const c of consultas) {
    const medicoId = (c.medico_id as string) ?? medicoDeCI.get(c.id as string) ?? "";
    const iso = (c.asignada_at as string | null) ?? (c.created_at as string);
    const lista = cisPorMedico.get(medicoId) ?? [];
    lista.push({ medicoId, inicioMs: Date.parse(iso) });
    cisPorMedico.set(medicoId, lista);
  }

  // ── 6) Componer ────────────────────────────────────────────────────────────
  const cerrada = semanaTerminada(lunes, ahoraMs);
  const filas: CumplimientoProfesional[] = universo.map((m) => {
    const horas = horasPorMedico.get(m.id) ?? Number(config.acuerdo_horas_semana_default);
    const motores = motoresPorMedico.get(m.id) ?? MOTORES_VACIOS();
    const sello = selladaPorMedico.get(m.id);

    if (sello) {
      const desglose = (sello.desglose_motores ?? {}) as {
        turnos?: number;
        ci?: number;
        motores?: Record<Motor, number>;
      };
      const minutosComprometidos = Math.round(Number(sello.horas_comprometidas) * 60);
      const minutosCumplidos = Number(sello.minutos_cumplidos);
      return {
        medicoId: m.id,
        nombre: m.nombre,
        especialidad: m.especialidad,
        horasComprometidas: Number(sello.horas_comprometidas),
        minutosComprometidos,
        minutosCumplidos,
        minutosTurnos: desglose.turnos ?? 0,
        minutosCI: desglose.ci ?? 0,
        porcentaje: minutosComprometidos > 0 ? Math.round((minutosCumplidos / minutosComprometidos) * 100) : 0,
        motores: desglose.motores ?? motores,
        badge: badgeCumplimiento(minutosCumplidos, minutosComprometidos, true),
        sellada: true,
      };
    }

    const bolsa = calcularBolsa({
      duracionSlotMin: config.slot_duracion_min,
      horasComprometidas: horas,
      slots: slotsPorMedico.get(m.id) ?? [],
      cis: cisPorMedico.get(m.id) ?? [],
    });
    return {
      medicoId: m.id,
      nombre: m.nombre,
      especialidad: m.especialidad,
      horasComprometidas: horas,
      minutosComprometidos: bolsa.minutosComprometidos,
      minutosCumplidos: bolsa.minutosCumplidos,
      minutosTurnos: bolsa.minutosTurnos,
      minutosCI: bolsa.minutosCI,
      porcentaje: bolsa.porcentaje,
      motores,
      badge: badgeCumplimiento(bolsa.minutosCumplidos, bolsa.minutosComprometidos, cerrada),
      sellada: false,
    };
  });

  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** El KPI de arriba: la bolsa de TODO el piloto en esa semana. */
export function totalDeBolsa(filas: CumplimientoProfesional[]): {
  minutosCumplidos: number;
  minutosComprometidos: number;
  porcentaje: number;
} {
  const minutosCumplidos = filas.reduce((s, f) => s + f.minutosCumplidos, 0);
  const minutosComprometidos = filas.reduce((s, f) => s + f.minutosComprometidos, 0);
  return {
    minutosCumplidos,
    minutosComprometidos,
    porcentaje: minutosComprometidos > 0 ? Math.round((minutosCumplidos / minutosComprometidos) * 100) : 0,
  };
}

/**
 * Encuentros terminales de esa semana que TODAVÍA no tienen fila en el
 * contador. Es la precondición del sello.
 *
 * ── POR QUÉ EL SELLO NO PUEDE CORRER SIN ESTO ────────────────────────────────
 * `cerrarSemana` congela lo que el clasificador HAYA ALCANZADO A ESCRIBIR, y
 * es idempotente a propósito: no recalcula nunca más. Si el job de metering
 * estuvo caído el fin de semana, el lunes se sellaría una semana incompleta y
 * quedaría inmutable — mientras la facturación, que lee la tabla en vivo, sí
 * cobraría esos encuentros cuando aparezcan. Dos números contractuales
 * divergiendo en silencio, y ninguno corregible sin levantar el sello a mano.
 *
 * Sellar tarde es barato. Sellar un número que todavía se está formando, no.
 *
 * Solo se cuentan los encuentros que DEBERÍAN producir fila: con paciente y con
 * un motor válido. Un slot que nadie tomó o un canal desconocido no generan
 * fila por diseño, y contarlos dejaría el sello bloqueado para siempre.
 */
export async function encuentrosSinClasificar(semanaAr: string): Promise<number> {
  const admin = createAdminClient();
  const lunes = semanaAr;
  const domingo = domingoDeSemana(lunes);
  const MOTORES = ["acordado", "espontaneo", "ofrecido"];

  const [turnos, consultas, filas] = await Promise.all([
    leerTodo<Record<string, unknown>>("turnos terminales de la semana", (desde, hasta) =>
      admin
        .from("turnos")
        .select("id")
        .in("estado", ESTADOS_TERMINALES_TURNO as unknown as string[])
        .in("canal_origen", MOTORES)
        .not("paciente_id", "is", null)
        .gte("fecha", lunes)
        .lte("fecha", domingo)
        .order("id", { ascending: true })
        .range(desde, hasta)
    ),
    // La CI no tiene columna de fecha AR: su semana sale del instante de
    // asignación, igual que en el contador. Se pide un día de más de cada lado
    // y se filtra en JS.
    leerTodo<Record<string, unknown>>("consultas terminales de la semana", (desde, hasta) =>
      admin
        .from("consultas")
        .select("id, asignada_at, created_at")
        .in("estado", ESTADOS_TERMINALES_CONSULTA as unknown as string[])
        .in("canal_origen", MOTORES)
        .gte("created_at", `${lunes}T00:00:00-03:00`)
        .lte("created_at", `${domingo}T23:59:59.999-03:00`)
        .order("id", { ascending: true })
        .range(desde, hasta)
    ),
    leerTodo<Record<string, unknown>>("filas del contador de la semana", (desde, hasta) =>
      admin
        .from("encuentros_metering")
        .select("tipo, recurso_id")
        .eq("semana_ar", lunes)
        .order("id", { ascending: true })
        .range(desde, hasta)
    ),
  ]);

  const conFila = new Set(filas.map((f) => `${f.tipo}|${f.recurso_id}`));
  let faltan = 0;
  for (const t of turnos) if (!conFila.has(`turno|${t.id}`)) faltan++;
  for (const c of consultas) {
    const iso = (c.asignada_at as string | null) ?? (c.created_at as string);
    if (lunesDeSemanaAR(iso) !== lunes) continue;
    if (!conFila.has(`consulta|${c.id}`)) faltan++;
  }
  return faltan;
}

export interface ResumenCierreSemana {
  semana_ar: string;
  profesionales: number;
  sellados: number;
  ya_estaban: number;
  errores: number;
}

/**
 * Sella una semana: calcula el cumplimiento y lo escribe como 'cerrada'.
 *
 * Idempotente: una semana ya sellada NO se recalcula (si el cron corre dos
 * veces, el número de la primera es el que queda). Eso es deliberado — el
 * sello es justamente la promesa de que el número no se mueve más.
 *
 * TIRA si no pudo leer (la excepción viene de `cumplimientoDeSemana`). "No
 * había nada que sellar" y "no pude leer el padrón" terminaban los dos en
 * `sellados: 0, errores: 0` y en un 200 del cron: el lunes perdido quedaba
 * invisible y, como el cron sella siempre la semana ANTERIOR, no se recuperaba
 * solo. Ahora lo primero devuelve 200 y lo segundo revienta con nombre.
 */
export async function cerrarSemana(semanaAr: string, ahoraMs = Date.now()): Promise<ResumenCierreSemana> {
  const admin = createAdminClient();
  const resumen: ResumenCierreSemana = {
    semana_ar: semanaAr,
    profesionales: 0,
    sellados: 0,
    ya_estaban: 0,
    errores: 0,
  };

  // Precondición: el contador terminó de contar esta semana. Si falta aunque
  // sea un encuentro, no se sella nada — un sello incompleto es inmutable.
  const faltan = await encuentrosSinClasificar(semanaAr);
  if (faltan > 0) {
    throw new Error(
      `La semana ${semanaAr} tiene ${faltan} encuentro(s) terminales sin clasificar: no se sella. ` +
        `Revisá el cron metering-clasificar y volvé a correr el cierre.`
    );
  }

  const filas = await cumplimientoDeSemana({ semanaAr, ahoraMs });
  resumen.profesionales = filas.length;
  const aSellar = filas.filter((f) => !f.sellada);
  resumen.ya_estaban = filas.length - aSellar.length;
  if (aSellar.length === 0) return resumen;

  const ahoraISO = new Date(ahoraMs).toISOString();
  const { error } = await admin.from("acuerdo_semanas").upsert(
    aSellar.map((f) => ({
      medico_id: f.medicoId,
      semana_ar: semanaAr,
      horas_comprometidas: f.horasComprometidas,
      minutos_cumplidos: f.minutosCumplidos,
      desglose_motores: { turnos: f.minutosTurnos, ci: f.minutosCI, motores: f.motores },
      estado: "cerrada",
      cerrada_at: ahoraISO,
      updated_at: ahoraISO,
    })),
    { onConflict: "medico_id,semana_ar" }
  );
  if (error) {
    console.error("[bolsa] No se pudo sellar la semana:", semanaAr, error.message);
    resumen.errores++;
    return resumen;
  }
  resumen.sellados = aSellar.length;
  return resumen;
}

/** La semana que el cron del lunes tiene que sellar: la que acaba de terminar. */
export function semanaASellar(ahoraMs = Date.now()): string {
  return lunesDeSemanaAR(new Date(ahoraMs - 7 * 24 * 3600_000).toISOString());
}

/** La semana AR de hoy (default del selector del panel). */
export function semanaDeHoy(ahoraMs = Date.now()): string {
  return lunesDeSemanaAR(new Date(ahoraMs).toISOString());
}

/** Día AR de un instante — reexportado para que el panel no importe dos módulos. */
export const diaARde = fechaARdeISO;
