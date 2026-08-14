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
//      corriente contadas sobre la tabla `asignaciones` con
//      `deltaDeAsignacion()`, NO un COUNT de estados de turnos. Una
//      reprogramación SÍ mueve el reparto: suma al que recibe y descuenta al
//      que pierde. Tiebreak: próximo slot más cercano.
//   3. DEDUPLICACIÓN: cada profesional UNA vez, en su mejor categoría, con
//      TODA su oferta adentro (slots acordado+ofrecido mezclados, etiquetados
//      por origen).
//   4. "X de Y": Y = horas_semanales (acuerdos_servicio) × 60 /
//      slot_duracion_min (config). La conversión horas→consultas vive ACÁ.
//   5. Acuerdo completo → BAJA DE PRIORIDAD (va al final), pero SE PUEDE ELEGIR
//      igual: R6 es flexible (ver abajo).
//
// ── R6 ES FLEXIBLE: EL ACUERDO ES PISO, NO TECHO (Diego, 13/08) ──────────────
// "Mientras el profesional tenga un turno publicado, ese turno se puede tomar"
// —aunque ya haya completado su acuerdo semanal—. El acuerdo es el mínimo de
// servicio comprometido; si el profesional publicó lugar, la institución puede
// llenarlo. La equidad se sigue cuidando por el ORDEN (menos asignados primero,
// y el completo al final), no bloqueando.
//
// Lo que había antes: `seleccionable:false` acá + un guard duro en
// `asignar-turno`/`asignar-ci` que devolvía 409 `acuerdo_completo`. Con eso, un
// turno publicado y libre era inasignable — el sistema le decía que no a una
// hora que el propio profesional había puesto a disposición.
//
// Hoy `seleccionable` significa una sola cosa: TIENE ALGO QUE OFRECER (CI
// activa o al menos un slot libre). El profesional con el acuerdo completo y
// sin nada publicado se sigue listando al final para que el operador entienda
// por qué no aparece arriba, y esa fila —esa sí— no se puede elegir: no hay
// nada que tomar.
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
  /**
   * `true` = tiene algo que tomar AHORA (CI activa o algún slot libre). El
   * acuerdo completo NO lo apaga (R6 flexible): un turno publicado se puede
   * tomar aunque la semana esté cumplida.
   */
  seleccionable: boolean;
  /** `true` = ya cumplió su acuerdo semanal. Baja de prioridad, no bloquea. */
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
 * profesional una vez en su mejor categoría, acuerdo completo al final —
 * ÚLTIMO, pero con su oferta adentro y elegible (R6 flexible).
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
      // R6 flexible: lo que habilita la fila es tener oferta, no el acuerdo.
      seleccionable: categoria !== null,
      acuerdo_completo: completo,
      // Los slots viajan SIEMPRE, completo o no: son la oferta que se puede
      // tomar. (Antes se vaciaban con el acuerdo completo — la fila quedaba
      // sin nada adentro y el turno publicado se volvía inalcanzable.)
      slots_semana: agruparPorDia(m.slots),
      _claveProximo: claveProximo(m),
    });
  }

  const pesoCategoria: Record<CategoriaOferta, number> = {
    ci_activa: 0,
    turno_acordado: 1,
    turno_ofrecido: 2,
  };

  filas.sort((a, b) => {
    // 1. Acuerdo completo al final. Es DEPRIORIZACIÓN, no bloqueo (R6
    //    flexible): la fila sigue siendo elegible, pero se le ofrece último.
    //    El `asignados ASC` de abajo ya empuja para el mismo lado (el que
    //    completó su acuerdo es, por definición, el que más lleva); esta clave
    //    lo hace explícito y hace que el corte de la lista coincida con la
    //    agrupación que pinta la pantalla, también para los clientes API.
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
 * Tamaño de página para las lecturas paginadas. PostgREST corta en 1000 filas
 * por defecto SIN error (hallazgo revisión Etapa 2: el conteo semanal — el
 * número que sostiene el acuerdo de horas con la institución — se truncaba en
 * silencio a escala de piloto). Todo SELECT de acá que pueda superar eso
 * pagina con .range() hasta agotar.
 */
const PAGINA_DB = 1000;

/**
 * Cuánto mueve el contador de equidad UNA fila de `asignaciones`.
 *
 * ── LA FILA REGISTRA A QUIEN RECIBE ──────────────────────────────────────────
 * Por eso `reprogramada` suma +1 y no 0 ni −1: `reprogramarTurnoInstitucional`
 * escribe esa fila con `medico_id` = el profesional que SE QUEDA con el
 * paciente. Y el que lo pierde recibe su propia fila `cancelada` (−1), incluso
 * cuando es el mismo profesional moviéndose de horario — ahí las dos se
 * cancelan y el neto es 0, que es lo correcto: sigue siendo un paciente.
 *
 * ⚠ El comentario de la migración 003 ("asignadas menos canceladas/
 * reprogramadas") describe otro reparto de filas, el que se imaginó antes de
 * que el motor existiera. Manda esta función.
 *
 * ── POR QUÉ IMPORTA TANTO ────────────────────────────────────────────────────
 * `reprogramada` valía 0. Reprogramado el día de un profesional: los que
 * RECIBÍAN sus pacientes no movían su contador, así que seguían primeros en la
 * fila de equidad (`asignados ASC`) y se les seguía apilando trabajo; y el que
 * no atendió a nadie conservaba sus asignaciones y bajaba de prioridad. La
 * equidad quedaba invertida justo el día que más se la necesita, y el "X de Y"
 * del turnero mentía.
 */
export function deltaDeAsignacion(accion: string): number {
  if (accion === "asignada" || accion === "reprogramada") return 1;
  if (accion === "cancelada") return -1;
  return 0; // reenvio_aviso, gestion_manual: no mueven el reparto
}

/**
 * Asignaciones de la semana AR corriente por médico, contadas sobre
 * `asignaciones` con `deltaDeAsignacion`. Nunca negativo.
 *
 * Lanza si la DB falla: un conteo silenciosamente vacío haría ver "0 de Y" a
 * todos y rompería la equidad — es el número con el que se ordena la oferta y
 * el que el operador lee para repartir.
 */
export async function contarAsignadosSemana(medicoIds: string[]): Promise<Map<string, number>> {
  const conteo = new Map<string, number>();
  if (medicoIds.length === 0) return conteo;
  const admin = createAdminClient();
  const desde = medianocheARenUTC(lunesDeSemanaAR());
  for (let off = 0; ; off += PAGINA_DB) {
    const { data, error } = await admin
      .from("asignaciones")
      .select("medico_id, accion")
      .in("medico_id", medicoIds)
      .gte("created_at", desde)
      .order("id", { ascending: true }) // orden estable para paginar sin huecos
      .range(off, off + PAGINA_DB - 1);
    if (error) {
      throw new Error(`No se pudo contar las asignaciones de la semana: ${error.message}`);
    }
    for (const fila of data ?? []) {
      const delta = deltaDeAsignacion(fila.accion);
      conteo.set(fila.medico_id, (conteo.get(fila.medico_id) ?? 0) + delta);
    }
    if (!data || data.length < PAGINA_DB) break;
  }
  for (const [k, v] of conteo) if (v < 0) conteo.set(k, 0);
  return conteo;
}

/**
 * Acuerdo semanal de UN médico: asignados, cupo ("Y") y si ya lo completó.
 *
 * Es INFORMATIVO, no un guard: desde que R6 es flexible (Diego, 13/08) el
 * acuerdo completo no bloquea ninguna asignación. Queda para pintar el "X de Y"
 * y para ordenar la oferta.
 */
export async function acuerdoSemanalDelMedico(
  medicoId: string
): Promise<{ asignados: number; acuerdo: number; completo: boolean }> {
  const config = await getConfigInstitucion();
  const [asignados, horas] = await Promise.all([
    contarAsignadosSemana([medicoId]),
    horasAcuerdoVigente([medicoId], Number(config.acuerdo_horas_semana_default)),
  ]);
  const x = asignados.get(medicoId) ?? 0;
  const y = cupoSemanal(horas.get(medicoId) ?? 0, config.slot_duracion_min);
  return { asignados: x, acuerdo: y, completo: y > 0 && x >= y };
}

/**
 * Médicos que NO pueden tomar otra CI ahora: encuentro EN CURSO (CI o turno)
 * o una CI 'pagada' ya asignada esperando que abran la sala. Sin la pata de
 * 'pagada' (hallazgo revisión Etapa 2) el médico seguía figurando como
 * ci_activa recién asignado y se le podían apilar dos pacientes "para ahora".
 */
async function medicosEnCurso(medicoIds: string[]): Promise<Set<string>> {
  if (medicoIds.length === 0) return new Set();
  const admin = createAdminClient();
  const [{ data: cis }, { data: tns }] = await Promise.all([
    admin
      .from("consultas")
      .select("medico_id")
      .in("medico_id", medicoIds)
      .in("estado", ["pagada", "en_curso"]),
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

// ─────────────────────────────────────────────────────────────────────────────
// EL AISLAMIENTO DE LA DEMO — dos mundos que no se cruzan
// ─────────────────────────────────────────────────────────────────────────────
//
// El profesional de una reunión de demostración nace `aprobado` y con una
// especialidad DEL PILOTO, a propósito: fuera de esa lista sería invisible y no
// habría demo. La contracara es que entra por la misma puerta que un profesional
// real — y como el relleno del escenario no escribe en `asignaciones`, cuenta
// cero asignados y el reparto parejo lo pone PRIMERO de su categoría.
//
// Que eso pase UNA vez alcanza para que un vecino del padrón sea atendido por
// alguien no matriculado, reciba un papel que dice "SIN VALIDEZ LEGAL", el
// servicio quede fuera del contador contractual, y su historia clínica se borre
// cuando alguien toque "limpiar reunión".
//
// Pero excluirlos a secas rompe la demo entera: la escena del call center ES
// asignarle un turno al participante. Así que no se excluye: se AÍSLA. La oferta
// tiene un mundo por vez, y cuál sale de quién es el paciente:
//
//   · paciente del padrón real  → SOLO profesionales sin `demo_sesion_id`;
//   · paciente de una reunión   → SOLO profesionales de ESA misma reunión.
//
// Y el aislamiento no depende de que la pantalla mande el parámetro correcto:
// `asignarTurno` y `asignarCI` vuelven a comprobar la pertenencia antes de
// escribir (ahí está el guard que de verdad manda).

/** El filtro de mundo, aplicado a un SELECT de `medicos`. Uno solo, dos usos. */
interface FiltroDeMedicos {
  eq(columna: string, valor: string): FiltroDeMedicos;
  is(columna: string, valor: null): FiltroDeMedicos;
}
export function acotarAlMundo<Q>(q: Q, demoSesionId: string | null): Q {
  // El cast es a propósito: atar el genérico a la forma del builder de PostgREST
  // hace que TypeScript intente resolver sus tipos recursivos y se rinda
  // ("Type instantiation is excessively deep"). Lo que importa se comprueba en
  // el uso, y son dos líneas.
  const filtro = q as unknown as FiltroDeMedicos;
  const acotada = demoSesionId
    ? filtro.eq("demo_sesion_id", demoSesionId)
    : filtro.is("demo_sesion_id", null);
  return acotada as unknown as Q;
}

/**
 * ¿De qué mundo es este paciente? `null` = el real.
 *
 * Lectura con service role y en query aparte, por el mismo motivo de siempre:
 * `demo_sesion_id` es una columna sin GRANT para `authenticated`.
 */
export async function mundoDelPaciente(pacienteId?: string | null): Promise<string | null> {
  if (!pacienteId) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pacientes")
    .select("demo_sesion_id")
    .eq("id", pacienteId)
    .maybeSingle();
  if (error) {
    // Fail-safe hacia el mundo real: ante la duda, el participante de la reunión
    // NO aparece. Se pierde una demo; no se pierde un paciente.
    console.error("[otorgador/oferta] No se pudo leer el mundo del paciente:", error.message);
    return null;
  }
  return (data?.demo_sesion_id as string | null) ?? null;
}

/**
 * Arma la oferta priorizada de UNA especialidad — el GET /api/otorgador/oferta.
 * Todo con service role (la vía de asignación no pasa por RLS; los guards son
 * de aplicación — spec §4.3).
 */
export async function armarOferta(
  especialidad: string,
  /**
   * De quién es esta oferta. Sin esto, es la del padrón real (ver
   * "EL AISLAMIENTO DE LA DEMO" arriba). `demoSesionId` es la vía directa para
   * los callers que no tienen paciente a mano (la reprogramación masiva).
   */
  opciones?: { pacienteId?: string | null; demoSesionId?: string | null }
): Promise<{ ok: true; oferta: OfertaEspecialidad } | { ok: false; error: string }> {
  const config = await getConfigInstitucion();
  if (!config.especialidades.includes(especialidad)) {
    return { ok: false, error: "Especialidad fuera del piloto de esta institución." };
  }

  const mundo =
    opciones?.demoSesionId !== undefined
      ? opciones.demoSesionId
      : await mundoDelPaciente(opciones?.pacienteId);

  const admin = createAdminClient();
  const { data: medicos, error: errMedicos } = await acotarAlMundo(
    admin
      .from("medicos")
      .select("id, nombre_completo, titulo, especialidad, disponible, disponible_desde_at")
      .eq("estado_registro", "aprobado")
      .eq("especialidad", especialidad),
    mundo
  );
  if (errMedicos) {
    console.error("[otorgador/oferta] Error leyendo médicos:", errMedicos.message);
    return { ok: false, error: "No se pudo leer la oferta. Probá de nuevo." };
  }

  const ids = (medicos ?? []).map((m) => m.id);
  const ciAbierta = dentroVentanaCI(config);

  // Slots de la SEMANA AR corriente, visibles hasta T-5 minutos. Paginado con
  // .range(): un .limit() fijo hacía desaparecer slots de la oferta sin señal
  // en cuanto el piloto superaba el techo (hallazgo revisión Etapa 2). El
  // orden fino (por día/hora) lo arma agruparPorDia; acá solo hace falta un
  // orden ESTABLE para que las páginas no se solapen.
  const hoy = fechaAR();
  const finSemana = domingoDeSemanaAR();
  const slots: { id: string; medico_id: string; fecha: string; hora_inicio: string; canal_origen: string }[] = [];
  if (ids.length) {
    for (let off = 0; ; off += PAGINA_DB) {
      const { data, error: errSlots } = await admin
        .from("turnos")
        .select("id, medico_id, fecha, hora_inicio, canal_origen")
        .in("medico_id", ids)
        .eq("estado", "disponible")
        .in("canal_origen", ["acordado", "ofrecido"])
        .gte("fecha", hoy)
        .lte("fecha", finSemana)
        .order("id", { ascending: true })
        .range(off, off + PAGINA_DB - 1);
      if (errSlots) {
        console.error("[otorgador/oferta] Error leyendo slots:", errSlots.message);
        return { ok: false, error: "No se pudo leer la oferta. Probá de nuevo." };
      }
      slots.push(...(data ?? []));
      if (!data || data.length < PAGINA_DB) break;
    }
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
export async function especialidadesConCI(opciones?: {
  pacienteId?: string | null;
}): Promise<{
  ventana_ci: string;
  ci_abierta_ahora: boolean;
  especialidades: { nombre: string; ci_activa_ahora: boolean }[];
}> {
  const config = await getConfigInstitucion();
  const ciAbierta = dentroVentanaCI(config);

  const conCI = new Set<string>();
  if (ciAbierta && config.especialidades.length > 0) {
    const mundo = await mundoDelPaciente(opciones?.pacienteId);
    const admin = createAdminClient();
    // Mismo mundo que `armarOferta`, y por el mismo motivo: el guion pide que el
    // participante se ponga `disponible` EN VIVO. Sin el aislamiento, ese toggle
    // prendía el chip "CI activa ahora" de esa especialidad para la operación
    // real durante toda la reunión — y sin el paciente, el chip de la demo no se
    // prendía nunca.
    const { data: activos } = await acotarAlMundo(
      admin
        .from("medicos")
        .select("id, especialidad")
        .eq("estado_registro", "aprobado")
        .eq("disponible", true)
        .in("especialidad", config.especialidades),
      mundo
    );
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
