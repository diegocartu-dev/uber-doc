// src/lib/otorgador/oferta.ts
// La priorización de la oferta del otorgador — SERVER-SIDE, en un solo lugar
// (spec institucional §4.4; 01-vision §Prioridad de asignación, decisión Diego
// 12/08). Regla madre del 04-spec §1.4: LA PANTALLA PINTA, LA API ORDENA —
// cero sort() en el cliente. Clientes: la pantalla del otorgador (1), un
// operador IA vía API key (2), Nova (3): todos heredan el mismo criterio de
// equidad sin reimplementar nada.
//
// Orden encadenado:
//   1. CATEGORÍA: ci_activa (puede atender AHORA) → turno_acordado →
//      turno_ofrecido.
//   2. Dentro de cada categoría: asignados ASC — asignaciones de la semana AR
//      corriente contadas sobre la tabla `asignaciones` (asignadas menos
//      canceladas), NO un COUNT de estados de turnos: una reprogramación no
//      debe distorsionar el reparto. Tiebreak: próximo slot más cercano.
//   3. DEDUPLICACIÓN: cada profesional UNA vez, en su mejor categoría, con
//      TODA su oferta adentro (slots acordado+ofrecido mezclados, etiquetados
//      por origen).
//   4. "X de Y": Y = horas_semanales (acuerdos_servicio) × 60 /
//      slot_duracion_min (config). La conversión horas→consultas vive ACÁ.
//   5. Acuerdo completo → al final, seleccionable: false (se ve, no se elige —
//      R6 de las reglas operativas).
//
// VENTANA DE ASIGNACIÓN (Diego 12/08): un slot se ofrece hasta 5 MINUTOS antes
// de su horario; después desaparece de la oferta (filtro server-side acá).
// Sin anticipación mínima adicional: el profesional comprometió esa agenda.

import { createAdminClient } from "@/lib/supabase/admin";
import { getConfigInstitucion, type ConfigInstitucion } from "@/lib/institucional/config";
import { fechaAR, lunesDeSemanaAR, medianocheARenUTC } from "@/lib/insights/fechas";

export const VENTANA_ASIGNACION_MIN = 5;

// ─── Tipos del shape de respuesta (04-spec §1.4 + ids que el mock no pedía) ──

export interface SlotHora {
  hora: string; // "16:30"
  turno_id: string;
  canal: "acordado" | "ofrecido";
}

export interface SlotsDia {
  dia: string; // "Mar 20/10" (+ " · Hoy" lo arma la UI si quiere)
  fecha: string; // "2026-10-20"
  horas: SlotHora[];
}

export type CategoriaOferta = "ci_activa" | "turno_acordado" | "turno_ofrecido";

export interface ProfesionalOferta {
  medico_id: string;
  nombre: string; // "Dra. Laura Fernández" (con título si lo tiene)
  especialidad: string;
  categoria: CategoriaOferta;
  /** Solo ci_activa: "14:05" (hora AR en que prendió el toggle), si se sabe. */
  activa_desde: string | null;
  /** Próximo slot: {fecha, hora} para armar "Hoy 17:15" / "Mar 20/10 · 16:30". */
  proximo: { fecha: string; hora: string } | null;
  asignados: number;
  acuerdo: number; // el "Y" del "X de Y"
  /** false = acuerdo semanal completo: se ve al final, no se puede elegir. */
  seleccionable: boolean;
  acuerdo_completo: boolean;
  slots_semana: SlotsDia[];
}

export interface OfertaEspecialidad {
  especialidad: string;
  ventana_ci: string; // "08:00–20:00"
  ci_abierta_ahora: boolean;
  profesionales: ProfesionalOferta[];
}

// ─── Parte pura (testeable sin DB) ───────────────────────────────────────────

export interface MedicoParaPriorizar {
  medico_id: string;
  nombre: string;
  especialidad: string;
  ci_activa: boolean; // disponible + dentro de ventana + sin encuentro en curso
  activa_desde: string | null;
  asignados: number;
  acuerdo: number;
  /** TODOS sus slots de la semana, ya filtrados por T-5 y estado disponible. */
  slots: { turno_id: string; fecha: string; hora: string; canal: "acordado" | "ofrecido" }[];
}

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function etiquetaDia(fecha: string): string {
  const d = new Date(fecha + "T12:00:00");
  return `${DIAS_CORTOS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function agruparPorDia(slots: MedicoParaPriorizar["slots"]): SlotsDia[] {
  const porFecha = new Map<string, SlotHora[]>();
  const orden = [...slots].sort((a, b) =>
    a.fecha === b.fecha ? a.hora.localeCompare(b.hora) : a.fecha.localeCompare(b.fecha)
  );
  for (const s of orden) {
    const arr = porFecha.get(s.fecha) ?? [];
    arr.push({ hora: s.hora.slice(0, 5), turno_id: s.turno_id, canal: s.canal });
    porFecha.set(s.fecha, arr);
  }
  return [...porFecha.entries()].map(([fecha, horas]) => ({
    fecha,
    dia: etiquetaDia(fecha),
    horas,
  }));
}

function proximoSlot(slots: MedicoParaPriorizar["slots"]): { fecha: string; hora: string } | null {
  if (slots.length === 0) return null;
  const primero = [...slots].sort((a, b) =>
    a.fecha === b.fecha ? a.hora.localeCompare(b.hora) : a.fecha.localeCompare(b.fecha)
  )[0];
  return { fecha: primero.fecha, hora: primero.hora.slice(0, 5) };
}

/** Clave de orden del próximo slot ("" = sin slots, ordena último en el tiebreak). */
function claveProximo(m: MedicoParaPriorizar): string {
  const p = proximoSlot(m.slots);
  return p ? `${p.fecha}T${p.hora}` : "9999-99-99T99:99";
}

/**
 * La priorización pura. Recibe los médicos de la especialidad con sus insumos
 * ya resueltos y devuelve la lista EXACTA que pinta la pantalla (y que ve un
 * operador IA): categorías en orden fijo, asignados ASC adentro, dedup un
 * profesional una vez en su mejor categoría, acuerdo completo al final.
 * Los médicos sin CI activa, sin slots y sin acuerdo completo NO aparecen
 * (no tienen nada que ofrecer ni nada que explicar).
 */
export function priorizarOferta(medicos: MedicoParaPriorizar[]): ProfesionalOferta[] {
  const filas: (ProfesionalOferta & { _claveProximo: string })[] = [];

  for (const m of medicos) {
    const completo = m.acuerdo > 0 && m.asignados >= m.acuerdo;
    const tieneSlots = m.slots.length > 0;

    // Mejor categoría (dedup): CI activa > acordado > ofrecido.
    let categoria: CategoriaOferta | null = null;
    if (m.ci_activa) categoria = "ci_activa";
    else if (m.slots.some((s) => s.canal === "acordado")) categoria = "turno_acordado";
    else if (tieneSlots) categoria = "turno_ofrecido";

    if (!categoria && !completo) continue; // nada que ofrecer ni explicar

    filas.push({
      medico_id: m.medico_id,
      nombre: m.nombre,
      especialidad: m.especialidad,
      // Con acuerdo completo la categoría es informativa (va al final igual);
      // si no ofrece nada, se lo lista como acordado para que se vea (R6).
      categoria: categoria ?? "turno_acordado",
      activa_desde: m.ci_activa ? m.activa_desde : null,
      proximo: proximoSlot(m.slots),
      asignados: m.asignados,
      acuerdo: m.acuerdo,
      seleccionable: !completo,
      acuerdo_completo: completo,
      // Acuerdo completo: la fila se ve pero no se elige — sin slots adentro
      // (04-spec §1.5.5: barra llena, sin chevron).
      slots_semana: completo ? [] : agruparPorDia(m.slots),
      _claveProximo: claveProximo(m),
    });
  }

  const pesoCategoria: Record<CategoriaOferta, number> = {
    ci_activa: 0,
    turno_acordado: 1,
    turno_ofrecido: 2,
  };

  filas.sort((a, b) => {
    // 1. Acuerdo completo SIEMPRE al final.
    if (a.acuerdo_completo !== b.acuerdo_completo) return a.acuerdo_completo ? 1 : -1;
    // 2. Categoría.
    if (pesoCategoria[a.categoria] !== pesoCategoria[b.categoria]) {
      return pesoCategoria[a.categoria] - pesoCategoria[b.categoria];
    }
    // 3. Reparto parejo: menos asignados primero.
    if (a.asignados !== b.asignados) return a.asignados - b.asignados;
    // 4. Tiebreak: próximo slot más cercano; después nombre (estabilidad).
    if (a._claveProximo !== b._claveProximo) return a._claveProximo.localeCompare(b._claveProximo);
    return a.nombre.localeCompare(b.nombre);
  });

  return filas.map((f) => {
    const fila: ProfesionalOferta & { _claveProximo?: string } = { ...f };
    delete fila._claveProximo;
    return fila as ProfesionalOferta;
  });
}

/** Y = horas semanales × 60 / duración del slot — la conversión vive ACÁ (§4.4). */
export function cupoSemanal(horasSemanales: number, slotDuracionMin: number): number {
  if (!(horasSemanales > 0) || !(slotDuracionMin > 0)) return 0;
  return Math.floor((horasSemanales * 60) / slotDuracionMin);
}

/** ¿La hora AR actual cae dentro de la ventana de CI del config? */
export function dentroVentanaCI(
  config: Pick<ConfigInstitucion, "ci_ventana_inicio" | "ci_ventana_fin">,
  ahora: Date = new Date()
): boolean {
  const ar = new Date(ahora.getTime() - 3 * 3600_000); // AR = UTC-3 fijo
  const hhmm = ar.toISOString().slice(11, 16);
  const ini = config.ci_ventana_inicio.slice(0, 5);
  const fin = config.ci_ventana_fin.slice(0, 5);
  return hhmm >= ini && hhmm < fin;
}

export function etiquetaVentana(
  config: Pick<ConfigInstitucion, "ci_ventana_inicio" | "ci_ventana_fin">
): string {
  return `${config.ci_ventana_inicio.slice(0, 5)}–${config.ci_ventana_fin.slice(0, 5)}`;
}

/** "HH:MM" AR de un timestamptz (para el "activa desde las 14:05"). */
function horaARdeISO(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms - 3 * 3600_000).toISOString().slice(11, 16);
}

/** Domingo de la semana AR corriente (fin del rango de oferta). */
function domingoDeSemanaAR(): string {
  const lunes = lunesDeSemanaAR();
  const d = new Date(lunes + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

// ─── Insumos desde la DB ─────────────────────────────────────────────────────

/**
 * Asignaciones de la semana AR corriente por médico, contadas sobre
 * `asignaciones`: asignadas − canceladas (las reprogramaciones ajustan cuando
 * exista ese motor — Etapa 6). Nunca negativo.
 */
export async function contarAsignadosSemana(medicoIds: string[]): Promise<Map<string, number>> {
  const conteo = new Map<string, number>();
  if (medicoIds.length === 0) return conteo;
  const admin = createAdminClient();
  const desde = medianocheARenUTC(lunesDeSemanaAR());
  const { data } = await admin
    .from("asignaciones")
    .select("medico_id, accion")
    .in("medico_id", medicoIds)
    .gte("created_at", desde);
  for (const fila of data ?? []) {
    const delta = fila.accion === "asignada" ? 1 : fila.accion === "cancelada" ? -1 : 0;
    conteo.set(fila.medico_id, (conteo.get(fila.medico_id) ?? 0) + delta);
  }
  for (const [k, v] of conteo) if (v < 0) conteo.set(k, 0);
  return conteo;
}

/** Médicos con un encuentro EN CURSO ahora (CI o turno): no pueden tomar otra CI. */
async function medicosEnCurso(medicoIds: string[]): Promise<Set<string>> {
  if (medicoIds.length === 0) return new Set();
  const admin = createAdminClient();
  const [{ data: cis }, { data: tns }] = await Promise.all([
    admin.from("consultas").select("medico_id").in("medico_id", medicoIds).eq("estado", "en_curso"),
    admin.from("turnos").select("medico_id").in("medico_id", medicoIds).eq("estado", "en_curso"),
  ]);
  return new Set([...(cis ?? []), ...(tns ?? [])].map((r) => r.medico_id).filter(Boolean));
}

/** Acuerdo vigente HOY por médico (horas semanales); fallback: default del config. */
async function horasAcuerdoVigente(
  medicoIds: string[],
  defaultHoras: number
): Promise<Map<string, number>> {
  const horas = new Map<string, number>();
  if (medicoIds.length === 0) return horas;
  const admin = createAdminClient();
  const hoy = fechaAR();
  const { data } = await admin
    .from("acuerdos_servicio")
    .select("medico_id, horas_semanales, vigente_desde, vigente_hasta")
    .in("medico_id", medicoIds)
    .lte("vigente_desde", hoy)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoy}`)
    .order("vigente_desde", { ascending: false });
  for (const a of data ?? []) {
    if (!horas.has(a.medico_id)) horas.set(a.medico_id, Number(a.horas_semanales));
  }
  for (const id of medicoIds) if (!horas.has(id)) horas.set(id, defaultHoras);
  return horas;
}

function nombreConTitulo(nombre: string | null, titulo: string | null): string {
  const n = (nombre ?? "").trim();
  const t = (titulo ?? "").trim();
  return t ? `${t} ${n}` : n;
}

/**
 * Arma la oferta priorizada de UNA especialidad — el GET /api/otorgador/oferta.
 * Todo con service role (la vía de asignación no pasa por RLS; los guards son
 * de aplicación — spec §4.3).
 */
export async function armarOferta(especialidad: string): Promise<
  | { ok: true; oferta: OfertaEspecialidad }
  | { ok: false; error: string }
> {
  const config = await getConfigInstitucion();
  if (!config.especialidades.includes(especialidad)) {
    return { ok: false, error: "Especialidad fuera del piloto de esta institución." };
  }

  const admin = createAdminClient();
  const { data: medicos, error: errMedicos } = await admin
    .from("medicos")
    .select("id, nombre_completo, titulo, especialidad, disponible, disponible_desde_at")
    .eq("estado_registro", "aprobado")
    .eq("especialidad", especialidad);
  if (errMedicos) {
    console.error("[otorgador/oferta] Error leyendo médicos:", errMedicos.message);
    return { ok: false, error: "No se pudo leer la oferta. Probá de nuevo." };
  }

  const ids = (medicos ?? []).map((m) => m.id);
  const ciAbierta = dentroVentanaCI(config);

  // Slots de la SEMANA AR corriente, visibles hasta T-5 minutos.
  const hoy = fechaAR();
  const finSemana = domingoDeSemanaAR();
  const { data: slots, error: errSlots } = ids.length
    ? await admin
        .from("turnos")
        .select("id, medico_id, fecha, hora_inicio, canal_origen")
        .in("medico_id", ids)
        .eq("estado", "disponible")
        .in("canal_origen", ["acordado", "ofrecido"])
        .gte("fecha", hoy)
        .lte("fecha", finSemana)
        .order("fecha", { ascending: true })
        .limit(2000)
    : { data: [], error: null };
  if (errSlots) {
    console.error("[otorgador/oferta] Error leyendo slots:", errSlots.message);
    return { ok: false, error: "No se pudo leer la oferta. Probá de nuevo." };
  }

  // Filtro T-5: el instante del slot (hora AR, UTC-3 fijo) debe estar a más de
  // VENTANA_ASIGNACION_MIN del ahora.
  const corteMs = Date.now() + VENTANA_ASIGNACION_MIN * 60_000;
  const slotsVigentes = (slots ?? []).filter((s) => {
    const hora = (s.hora_inicio ?? "").slice(0, 8);
    const ms = new Date(`${s.fecha}T${hora.length === 5 ? hora + ":00" : hora}-03:00`).getTime();
    return !Number.isNaN(ms) && ms > corteMs;
  });

  const [asignados, enCurso, horas] = await Promise.all([
    contarAsignadosSemana(ids),
    medicosEnCurso(ids),
    horasAcuerdoVigente(ids, Number(config.acuerdo_horas_semana_default)),
  ]);

  const slotsPorMedico = new Map<string, MedicoParaPriorizar["slots"]>();
  for (const s of slotsVigentes) {
    const arr = slotsPorMedico.get(s.medico_id) ?? [];
    arr.push({
      turno_id: s.id,
      fecha: s.fecha,
      hora: s.hora_inicio,
      canal: s.canal_origen as "acordado" | "ofrecido",
    });
    slotsPorMedico.set(s.medico_id, arr);
  }

  const paraPriorizar: MedicoParaPriorizar[] = (medicos ?? []).map((m) => ({
    medico_id: m.id,
    nombre: nombreConTitulo(m.nombre_completo, m.titulo),
    especialidad,
    ci_activa: Boolean(m.disponible) && ciAbierta && !enCurso.has(m.id),
    activa_desde: horaARdeISO(m.disponible_desde_at),
    asignados: asignados.get(m.id) ?? 0,
    acuerdo: cupoSemanal(horas.get(m.id) ?? 0, config.slot_duracion_min),
    slots: slotsPorMedico.get(m.id) ?? [],
  }));

  return {
    ok: true,
    oferta: {
      especialidad,
      ventana_ci: etiquetaVentana(config),
      ci_abierta_ahora: ciAbierta,
      profesionales: priorizarOferta(paraPriorizar),
    },
  };
}

/**
 * Flags de CI activa por especialidad (chips del bloque 2 — spec §4.3,
 * GET /api/otorgador/especialidades).
 */
export async function especialidadesConCI(): Promise<{
  ventana_ci: string;
  ci_abierta_ahora: boolean;
  especialidades: { nombre: string; ci_activa_ahora: boolean }[];
}> {
  const config = await getConfigInstitucion();
  const ciAbierta = dentroVentanaCI(config);

  const conCI = new Set<string>();
  if (ciAbierta && config.especialidades.length > 0) {
    const admin = createAdminClient();
    const { data: activos } = await admin
      .from("medicos")
      .select("id, especialidad")
      .eq("estado_registro", "aprobado")
      .eq("disponible", true)
      .in("especialidad", config.especialidades);
    if (activos && activos.length > 0) {
      const ocupados = await medicosEnCurso(activos.map((m) => m.id));
      for (const m of activos) {
        if (!ocupados.has(m.id)) conCI.add(m.especialidad);
      }
    }
  }

  return {
    ventana_ci: etiquetaVentana(config),
    ci_abierta_ahora: ciAbierta,
    especialidades: config.especialidades.map((nombre) => ({
      nombre,
      ci_activa_ahora: conCI.has(nombre),
    })),
  };
}
