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

/** "2026-10-31" + 1 → "2026-11-01". Mediodía UTC para no rozar ningún borde. */
export function correrDias(diaAr: string, dias: number): string {
  const d = new Date(`${diaAr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * El día AR al que pertenece una consulta inmediata: el de su ASIGNACIÓN, con
 * `created_at` de respaldo.
 *
 * Es R31 bis —"manda cuándo se hizo, no cuándo se cerró"— y es la MISMA regla
 * que usa el contador (`clasificar.ts`, `ocurridoISO`). Está acá afuera, con
 * nombre, porque es lo que hace que la ventana de la precondición necesite un
 * día de margen de cada lado: la query filtra por `created_at` y la decisión la
 * toma esta función, y los dos instantes pueden caer en días distintos.
 */
export function diaARdeConsulta(c: {
  asignada_at?: unknown;
  created_at?: unknown;
}): string {
  return fechaARdeISO((c.asignada_at as string | null) ?? (c.created_at as string));
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

/**
 * Qué hace CADA estado de `turnos` con la bolsa de horas. Es exhaustivo a
 * propósito (hallazgo S2 del gate #405): la versión anterior era
 * `descuenta ? "descuenta" : "cuenta"`, o sea que un estado nuevo —o uno viejo
 * que nadie recordaba— entraba SUMANDO horas de cumplimiento sin que nadie lo
 * decidiera. En una tabla que sostiene un acuerdo contractual, el default no
 * puede ser "cuenta a favor del profesional".
 *
 * La lista sale del CHECK vivo de `turnos`
 * (`supabase/migrations/20260512_mp_fase2.sql`).
 */
const APORTE_POR_ESTADO: Record<string, "cuenta" | "descuenta" | "ignora"> = {
  // CUENTAN — la hora estuvo puesta a disposición, se haya usado o no.
  disponible: "cuenta",
  reservado_pendiente: "cuenta", // no ocurre en la instancia (no hay checkout), pero si ocurriera, la hora se puso
  confirmado: "cuenta",
  en_espera: "cuenta",
  en_curso: "cuenta",
  completado: "cuenta",
  ausente_paciente: "cuenta", // faltó el paciente: el profesional estaba
  cancelado_paciente: "cuenta",
  // DESCUENTAN — la ausencia o la baja las decidió el profesional.
  ausente_medico: "descuenta",
  cancelado_medico: "descuenta",
  // NEUTROS — la agenda la dio de baja la INSTITUCIÓN (ver abajo).
  bloqueado: "ignora",
  bloqueado_sin_cobro: "ignora",
  // El turno MOVIDO. Era "cuenta" con el argumento "el hueco existió igual", y
  // eso es cierto cuando el hueco lo mueve la institución — pero el motor que
  // estrena esta etapa escribe `reprogramado` en el caso CONTRARIO: el
  // profesional avisó que NO va a atender ese día. Acreditárselo convertía
  // sistemáticamente un descuento en un crédito, que es justo lo que el
  // hallazgo S2 quiso evitar ("el default no puede ser cuenta a favor del
  // profesional").
  //
  // Neutro es lo correcto en las DOS direcciones, y no hace falta preguntar por
  // el motivo: el encuentro real es el turno NUEVO, que le cuenta a quien lo
  // recibe. Si además contara en el origen, la misma hora de agenda se
  // acreditaría dos veces, a dos profesionales distintos — la deduplicación por
  // `clave` no lo agarra, porque la clave lleva el medicoId adentro.
  //
  // Lo que sí hacía falta y no existía: que el día del profesional que no
  // atiende quede MARCADO. Sus slots libres seguían en `disponible` ("cuenta"),
  // así que el martes entero entraba como horas puestas a disposición. Eso lo
  // resuelve `marcarDiaSinAtencionDelProfesional()` (src/lib/otorgador/
  // reprogramar.ts), que los pasa a `cancelado_medico` — que descuenta.
  reprogramado: "ignora",
};

/**
 * Qué hace un slot con la bolsa de horas, según su estado.
 *
 * ── EL CASO QUE LA REGLA NO CONTEMPLABA: `bloqueado` ────────────────────────
 * Cuando la INSTITUCIÓN da de baja una agenda (`desactivarAgenda`), todos los
 * slots `disponible` de ese modelo pasan a `bloqueado`. La regla escrita habla
 * de la ausencia del profesional y de las agendas que canceló ÉL; de este caso
 * no dice nada, y por omisión el slot terminaba SUMÁNDOLE horas de disposición
 * a alguien que ya no podía recibir turnos ahí. El mismo hueco aparecía además
 * en el KPI "sin asignar", o sea dos veces y con dos lecturas contradictorias:
 * "cumplió" y "nadie lo tomó".
 *
 * Decisión: un slot bloqueado es NEUTRO. No suma —el profesional no puso esa
 * hora a disposición de nadie, porque la agenda estaba cerrada— y no descuenta
 * —la baja no la decidió él—. Simplemente no existe para la bolsa.
 *
 * ⚠ Es una decisión de producto tomada por omisión hasta que Diego la
 * confirme: hoy el número lo definía el silencio de la regla, ahora lo define
 * una línea con nombre y un test.
 *
 * ── UN ESTADO DESCONOCIDO ES UN ERROR, NO UN "CUENTA" ────────────────────────
 * Si mañana aparece un estado que esta tabla no contempla, esta función TIRA.
 * Es incómodo y es lo correcto: el caller (`cumplimientoDeSemana`) ya propaga
 * los errores, y la alternativa —seguir de largo sumando— es que una semana se
 * selle con horas que nadie decidió acreditar, en una tabla inmutable, sobre un
 * número que se le factura a la institución. Un panel que no abre se arregla
 * en una hora; un sello mal puesto hay que levantarlo a mano y explicarlo.
 */
export function aporteDelSlot(estado: string): "cuenta" | "descuenta" | "ignora" {
  const aporte = APORTE_POR_ESTADO[estado];
  if (!aporte) {
    throw new Error(
      `Estado de turno desconocido para la bolsa de horas: "${estado}". ` +
        `Agregalo a APORTE_POR_ESTADO en src/lib/metering/bolsa.ts decidiendo ` +
        `explícitamente si cuenta, descuenta o es neutro — no hay default.`
    );
  }
  return aporte;
}

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
    const aporte = aporteDelSlot(t.estado as string);
    if (aporte === "ignora") continue;
    const medicoId = t.medico_id as string;
    const lista = slotsPorMedico.get(medicoId) ?? [];
    lista.push({
      clave: `${medicoId}|${t.fecha}|${String(t.hora_inicio).slice(0, 5)}`,
      medicoId,
      inicioMs,
      finMs,
      descuenta: aporte === "descuenta",
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
 * Estados de turno que NUNCA van a producir una fila del contador y tampoco
 * son terminales. Son los bordes de `encuentrosSinClasificar` (M1 del gate
 * #405) y hay que nombrarlos, porque tratarlos como "vivos" dejaría el sello
 * bloqueado PARA SIEMPRE:
 *   · `disponible` / `bloqueado` / `bloqueado_sin_cobro` — no tienen paciente,
 *     así que el filtro de paciente ya los saca; están acá para que se lea la
 *     lista completa en un solo lugar.
 *   · `reprogramado` — sí tiene paciente y NO es terminal, pero es el rastro de
 *     un turno que se movió: el encuentro real es el turno nuevo, y este no va
 *     a cambiar de estado nunca más.
 *
 * `reservado_pendiente` NO está acá a propósito: en la instancia no existe
 * (no hay checkout que esperar), y si apareciera, es un turno vivo de verdad.
 */
const TURNO_SIN_DESTINO = ["disponible", "bloqueado", "bloqueado_sin_cobro", "reprogramado"];

/** Qué es un encuentro para el sello. Ver `destinoDelEncuentro`. */
export type DestinoDelEncuentro = "terminal" | "vivo" | "sin_destino";

/**
 * LA DECISIÓN de I1, en una función pura y testeable.
 *
 * Estaba escrita adentro de las queries de `encuentrosSinClasificar` (un
 * `.not("estado","in", …)`), o sea que la única forma de verificar la parte más
 * cara del hallazgo —que un encuentro vivo del domingo bloquea el sello y que
 * un `reprogramado` NO lo bloquea para siempre— era leer código.
 *
 * Y el signo importa: si el complemento quedara al revés, o el sello se
 * bloquearía eternamente (nadie lo notaría hasta que la institución reclame el
 * cumplimiento) o volvería a sellar de más, que es el bug original.
 *
 *   · `terminal`     — ya cerró: DEBE tener fila en el contador.
 *   · `sin_destino`  — nunca va a producir fila y tampoco va a cambiar de
 *                      estado: no bloquea nunca (si bloqueara, el sello
 *                      quedaría trabado PARA SIEMPRE).
 *   · `vivo`         — todavía está pasando: bloquea.
 *
 * Es COMPLEMENTO, no lista blanca: un estado que no conozcamos cae en `vivo` y
 * bloquea. Sellar es irreversible; la duda se resuelve esperando.
 */
export function destinoDelEncuentro(
  tipo: "turno" | "consulta",
  estado: string
): DestinoDelEncuentro {
  if (tipo === "consulta") {
    // La CI no tiene estados "sin destino": o cerró o sigue viva. La colgada
    // del domingo 20:00 cae acá como `vivo`, que es todo el hallazgo I1.
    return (ESTADOS_TERMINALES_CONSULTA as unknown as string[]).includes(estado)
      ? "terminal"
      : "vivo";
  }
  if ((ESTADOS_TERMINALES_TURNO as unknown as string[]).includes(estado)) return "terminal";
  if (TURNO_SIN_DESTINO.includes(estado)) return "sin_destino";
  return "vivo";
}

/**
 * ¿Este encuentro impide sellar la semana?
 *
 * `tieneFila` = ya está en `encuentros_metering`. Solo importa para los
 * terminales: un terminal sin fila es el clasificador atrasado, y sellar sin él
 * congelaría un número que la facturación —que lee la tabla en vivo— sí va a
 * cobrar. Dos números contractuales divergiendo en silencio.
 */
export function bloqueaElSello(
  tipo: "turno" | "consulta",
  estado: string,
  tieneFila: boolean
): boolean {
  switch (destinoDelEncuentro(tipo, estado)) {
    case "terminal":
      return !tieneFila;
    case "sin_destino":
      return false;
    case "vivo":
      return true;
  }
}

export interface Faltantes {
  /** Terminales sin fila en el contador (el job no llegó). */
  sin_fila: number;
  /** Todavía vivos: van a producir fila DESPUÉS del sello si se sella ahora. */
  vivos: number;
  total: number;
}

/** Nombre viejo, cuando el único sello era el semanal. */
export type FaltantesDeSemana = Faltantes;

/**
 * Encuentros de esa semana que impiden sellarla. Es la precondición del sello.
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
 * ── LOS VIVOS TAMBIÉN CUENTAN (I1 del gate #405) ─────────────────────────────
 * La versión anterior miraba SOLO encuentros ya terminales, y por ese hueco se
 * colaba el caso más caro: una consulta inmediata que quedó colgada el domingo
 * a la noche no es terminal el lunes a la madrugada —cuando corre el cron del
 * cierre—, así que el sello no la veía, se sellaba la semana sin ella, y cuando
 * después aparecía su fila facturable el cumplimiento sellado ya no la podía
 * incorporar. La factura la cobraba igual: los dos números contractuales, otra
 * vez, divergiendo en silencio.
 *
 * (Los crons de Vercel se programan en UTC: `cerrar-huerfanas` es `0 3 * * *`,
 * o sea 00:00 ART y todos los días, no "el martes a las 3 AM".)
 *
 * Ahora un encuentro VIVO de la semana bloquea el sello igual que uno sin
 * clasificar. Es más conservador a propósito: la respuesta correcta a "todavía
 * está pasando algo de esa semana" es esperar, no congelar.
 *
 * Solo se cuentan los encuentros que DEBERÍAN producir fila: con paciente y con
 * un motor válido. Un slot que nadie tomó o un canal desconocido no generan
 * fila por diseño, y contarlos dejaría el sello bloqueado para siempre.
 */
export async function encuentrosSinClasificar(semanaAr: string): Promise<Faltantes> {
  return encuentrosSinClasificarEnRango(semanaAr, domingoDeSemana(semanaAr));
}

/**
 * La misma precondición, sobre un rango de días AR cualquiera.
 *
 * Existe porque el sello mensual (R31, `cerrarMes`) necesita EXACTAMENTE la
 * misma garantía que el semanal: no congelar un período mientras el contador
 * todavía está contándolo. La regla —qué bloquea y qué no— es una sola
 * (`bloqueaElSello`) y no se re-escribe por período: si divergieran, el mes y
 * la semana podrían dar respuestas distintas sobre el mismo encuentro, y el
 * cumplimiento sellado y la factura volverían a mirarse de reojo.
 *
 * Los dos extremos son inclusive y en hora AR: `hastaAr` incluye todo el día
 * (hasta 23:59:59.999 AR), que es el "corte a las 24:00" de R31.
 */
export async function encuentrosSinClasificarEnRango(
  desdeAr: string,
  hastaAr: string
): Promise<Faltantes> {
  const admin = createAdminClient();
  const desdeDia = desdeAr;
  const hastaDia = hastaAr;
  const MOTORES = ["acordado", "espontaneo", "ofrecido"];
  const TERMINALES_TURNO = ESTADOS_TERMINALES_TURNO as unknown as string[];
  const TERMINALES_CONSULTA = ESTADOS_TERMINALES_CONSULTA as unknown as string[];

  // Las CI se piden con UN DÍA DE MÁS de cada lado y se filtran en JS. Su día
  // AR sale de `asignada_at` (con `created_at` de respaldo), que puede caer del
  // otro lado del borde respecto de `created_at` — que es por lo que filtra la
  // query. Sin el margen, una CI asignada a la medianoche del último día del
  // período no entraba a la lista de candidatos y el sello no la veía. Pedir de
  // más es barato; el que decide es el filtro de abajo.
  const desdeMargen = correrDias(desdeDia, -1);
  const hastaMargen = correrDias(hastaDia, 1);

  const [turnos, turnosVivos, consultas, consultasVivas, filas] = await Promise.all([
    leerTodo<Record<string, unknown>>("turnos terminales del período", (desde, hasta) =>
      admin
        .from("turnos")
        .select("id, estado")
        .in("estado", TERMINALES_TURNO)
        .in("canal_origen", MOTORES)
        .not("paciente_id", "is", null)
        .gte("fecha", desdeDia)
        .lte("fecha", hastaDia)
        .order("id", { ascending: true })
        .range(desde, hasta)
    ),
    // Vivos por COMPLEMENTO, no por lista blanca: un estado que no conozcamos
    // bloquea el sello en vez de pasar de largo. Sellar es irreversible; la
    // duda se resuelve esperando.
    leerTodo<Record<string, unknown>>("turnos todavía vivos del período", (desde, hasta) =>
      admin
        .from("turnos")
        .select("id, estado")
        .not("estado", "in", `(${[...TERMINALES_TURNO, ...TURNO_SIN_DESTINO].join(",")})`)
        .in("canal_origen", MOTORES)
        .not("paciente_id", "is", null)
        .gte("fecha", desdeDia)
        .lte("fecha", hastaDia)
        .order("id", { ascending: true })
        .range(desde, hasta)
    ),
    // La CI no tiene columna de fecha AR: su día sale del instante de
    // asignación, igual que en el contador.
    leerTodo<Record<string, unknown>>("consultas terminales del período", (desde, hasta) =>
      admin
        .from("consultas")
        .select("id, estado, asignada_at, created_at")
        .in("estado", TERMINALES_CONSULTA)
        .in("canal_origen", MOTORES)
        .gte("created_at", `${desdeMargen}T00:00:00-03:00`)
        .lte("created_at", `${hastaMargen}T23:59:59.999-03:00`)
        .order("id", { ascending: true })
        .range(desde, hasta)
    ),
    leerTodo<Record<string, unknown>>("consultas todavía vivas del período", (desde, hasta) =>
      admin
        .from("consultas")
        .select("id, estado, asignada_at, created_at")
        .not("estado", "in", `(${TERMINALES_CONSULTA.join(",")})`)
        .in("canal_origen", MOTORES)
        .gte("created_at", `${desdeMargen}T00:00:00-03:00`)
        .lte("created_at", `${hastaMargen}T23:59:59.999-03:00`)
        .order("id", { ascending: true })
        .range(desde, hasta)
    ),
    // El contador se lee por DÍA AR y no por `semana_ar`, que es lo que hacía
    // la versión semanal: el mes no es un múltiplo de semanas. `fecha_ar` y
    // `semana_ar` salen del mismo instante en `clasificar.ts`, así que para una
    // semana el conjunto es exactamente el mismo.
    leerTodo<Record<string, unknown>>("filas del contador del período", (desde, hasta) =>
      admin
        .from("encuentros_metering")
        .select("tipo, recurso_id")
        .gte("fecha_ar", desdeDia)
        .lte("fecha_ar", hastaDia)
        .order("id", { ascending: true })
        .range(desde, hasta)
    ),
  ]);

  /** ¿El día AR de esta CI cae adentro del período? */
  const delPeriodo = (c: Record<string, unknown>) => {
    const dia = diaARdeConsulta(c);
    return dia >= desdeDia && dia <= hastaDia;
  };

  // El conteo pasa por `bloqueaElSello` —la decisión pura y testeada— y no por
  // la forma de la query: los `.in()` / `.not(...in...)` de arriba son un
  // prefiltro de la DB, no la regla. Si alguna vez divergen, manda la función.
  const conFila = new Set(filas.map((f) => `${f.tipo}|${f.recurso_id}`));
  let sinFila = 0;
  for (const t of turnos) {
    if (bloqueaElSello("turno", t.estado as string, conFila.has(`turno|${t.id}`))) sinFila++;
  }
  for (const c of consultas) {
    if (!delPeriodo(c)) continue;
    if (bloqueaElSello("consulta", c.estado as string, conFila.has(`consulta|${c.id}`))) sinFila++;
  }

  const vivos =
    turnosVivos.filter((t) => bloqueaElSello("turno", t.estado as string, false)).length +
    consultasVivas
      .filter(delPeriodo)
      .filter((c) => bloqueaElSello("consulta", c.estado as string, false)).length;
  return { sin_fila: sinFila, vivos, total: sinFila + vivos };
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

  // ── PRECONDICIÓN CERO: la semana TERMINÓ ───────────────────────────────────
  // Antes no hacía falta chequearlo porque el único caller era el cron, que
  // pasa siempre `semanaASellar()`. Con la corrida manual de I2 la puerta se
  // abrió, y la precondición de abajo NO la cubre: `encuentrosSinClasificar`
  // de una semana futura —o de la de hoy un martes a la mañana— da total=0 sin
  // problema, porque todavía no hay nada vivo. Y `cumplimientoDeSemana` solo
  // cuenta lo TRANSCURRIDO, así que se sellaría el cumplimiento de un día y
  // medio (o de cero) como si fuera la semana entera. Después `cerrarSemana`
  // saltea para siempre las filas ya `sellada` y el trigger de la 015 las hace
  // inmutables: un dedo que tipea el lunes de esta semana en vez del de la
  // anterior le factura a la institución el 20 % de las horas, y hay que
  // reabrir a mano por SQL.
  //
  // Es cinturón: el endpoint ya rechaza con 422 antes de llegar acá. Los
  // tirantes van igual porque el que sella es este.
  if (!semanaTerminada(semanaAr, ahoraMs)) {
    throw new Error(
      `La semana ${semanaAr} TODAVÍA NO TERMINÓ: no se puede sellar. Un sello es ` +
        `inmutable y el cumplimiento se calcula solo sobre lo transcurrido, así que ` +
        `sellarla ahora congelaría un número parcial para siempre. La última semana ` +
        `terminada es ${semanaASellar(ahoraMs)}.`
    );
  }

  // Precondición: el contador terminó de contar esta semana. Si falta aunque
  // sea un encuentro, no se sella nada — un sello incompleto es inmutable.
  const faltan = await encuentrosSinClasificar(semanaAr);
  if (faltan.total > 0) {
    throw new Error(
      `La semana ${semanaAr} todavía no se puede sellar: ${faltan.sin_fila} encuentro(s) terminales ` +
        `sin clasificar y ${faltan.vivos} todavía en curso. Revisá el cron metering-clasificar ` +
        `(y, si hay vivos, esperá a que cierren o a que los cierre cerrar-huerfanas) y volvé a ` +
        `correr el cierre con POST /api/admin/institucional/cerrar-semana.`
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
