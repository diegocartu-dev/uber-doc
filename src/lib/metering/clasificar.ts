// src/lib/metering/clasificar.ts
// EL CONTADOR: qué encuentro se factura y qué encuentro no (spec institucional
// §6.1-6.3, R11-R13). SOLO instancia institucional.
//
// ── LA REGLA CONTRACTUAL, TEXTUAL ────────────────────────────────────────────
// "Se factura la consulta con ambos participantes en sala al menos 60 segundos
//  y/o documento emitido. Las ausencias no se facturan."
// Esa frase está impresa en el panel que ve la institución (mock 4) y es la
// misma que se calcula acá. Si alguna vez divergen, gana la frase: es la que
// firmó el cliente.
//
// ── DE DÓNDE SALE EL RELOJ ───────────────────────────────────────────────────
// De `video_presencia` (webhook LiveKit, append-only). Hasta hoy el único
// lector de esa tabla era el propio webhook: el metering es su primer
// consumidor real. Con lo que hay se puede reconstruir todo, pero con dos
// asteriscos conocidos (spec §6.1):
//   · `ocurrido_at` es la hora de LLEGADA del webhook, no la del evento (la
//     real viaja adentro de `raw.createdAt`). Diferencia: milisegundos en el
//     caso normal, segundos si LiveKit reintenta. Para un umbral de 60 s no
//     mueve el resultado, pero está anotado porque el día que el umbral baje
//     sí va a importar.
//   · No hay dedup de reintentos a nivel tabla (el `id` del evento está en
//     `raw`). El delta que agregaría `evento_id`/`evento_at` es el ÚNICO roce
//     con el código del canal clínico y quedó pendiente de decisión: por eso
//     este módulo ARRANCA SIN ÉL, deduplicando en memoria (por `raw.id` cuando
//     viaja, y por identidad-abierta cuando no) — la spec dice explícitamente
//     que el metering puede arrancar sin el delta.
//
// ── POR QUÉ EL NÚCLEO ES PURO ────────────────────────────────────────────────
// Porque los números del mock 4 son un CASO DE TEST (spec §6.6): 98 encuentros
// sintéticos tienen que dar 87 facturables, 9 + 2 ausencias y una bolsa de
// 29,5 de 30 horas. Eso se verifica sin base de datos solo si la regla vive en
// funciones puras — la parte que habla con Supabase es la cáscara.

import { createAdminClient } from "@/lib/supabase/admin";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { fechaARdeISO, lunesDeSemanaAR } from "@/lib/insights/fechas";
import { leerTodo, leerTodoEnLotes } from "@/lib/metering/db";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS Y CONSTANTES DEL CONTRATO
// ─────────────────────────────────────────────────────────────────────────────

export type Clasificacion =
  | "facturable"
  | "no_facturable_corta"
  | "ausente_paciente"
  | "ausente_profesional"
  | "falla_tecnica";

export type Motor = "acordado" | "espontaneo" | "ofrecido";

/** El umbral del contrato. Un número, un solo lugar. */
export const SEGUNDOS_FACTURABLE = 60;

/**
 * Cuánto se espera después del cierre antes de clasificar.
 *
 * No es prudencia genérica: el rescate de borrador (`cerrar-con-rescate.ts`,
 * que disparan el webhook de video y el cron de huérfanas) puede EMITIR
 * DOCUMENTOS después de que la atención quedó cerrada. Clasificar antes de esa
 * ventana convertiría en "no facturable" a una consulta que sí dejó receta.
 */
export const ESPERA_POST_CIERRE_MIN = 15;

// ─────────────────────────────────────────────────────────────────────────────
// LOS ESTADOS QUE LA BASE ACEPTA DE VERDAD
//
// Estas dos listas no son documentación: viajan a PostgREST dentro de un `.in()`
// (acá y en `bolsa.ts`). Un valor inventado NO se ignora — y las dos columnas
// fallan de maneras opuestas, que es lo que hizo tan cara la última equivocación:
//
//   · `consultas.estado` es un ENUM de Postgres. Un valor que no es miembro
//     rompe la comparación ENTERA: la query tira
//     `invalid input value for enum estado_consulta`, no vuelve NI UNA fila, y
//     el contador se queda en cero. No hay degradación parcial.
//   · `turnos.estado` es `text` con un CHECK. Un valor desconocido no rompe
//     nada: simplemente no matchea, y el encuentro queda sin contar en silencio.
//
// Incidente que las motiva (13/08/2026): `ESTADOS_TERMINALES_CONSULTA` tenía
// `"rechazada"`, que NUNCA fue miembro de `estado_consulta` —verificado contra
// las dos bases, la del B2C y la de la instancia—. El contador devolvió 500 en
// el 100 % de sus corridas desde que se prendió, y el sello semanal
// (`encuentrosSinClasificar`, que usa la misma lista) habría muerto igual la
// primera vez que le tocara correr. En el B2C el bug estaba tapado: el gate
// `cortarSiB2C` frena el cron antes de la query.
//
// Por eso abajo están los valores VÁLIDOS, y un test verifica que las listas
// terminales sean un subconjunto. Un estado inventado ahora rompe el CI, no la
// factura del mes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Todos los valores del enum `estado_consulta`, tal cual están en la base.
 * Para refrescar:
 *   select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
 *   where t.typname = 'estado_consulta' order by e.enumsortorder;
 */
export const ESTADOS_CONSULTA_VALIDOS = [
  "esperando",
  "aceptada",
  "pagada",
  "en_curso",
  "completada",
  "cancelada",
  "no_show_paciente",
  "medico_ausente",
  "interrumpida",
] as const;

/**
 * Todos los valores que el CHECK de `turnos.estado` acepta.
 * Para refrescar:
 *   select pg_get_constraintdef(oid) from pg_constraint
 *   where conrelid = 'public.turnos'::regclass;
 */
export const ESTADOS_TURNO_VALIDOS = [
  "disponible",
  "reservado_pendiente",
  "confirmado",
  "en_espera",
  "en_curso",
  "completado",
  "ausente_paciente",
  "ausente_medico",
  "cancelado_paciente",
  "cancelado_medico",
  "reprogramado",
  "bloqueado",
  "bloqueado_sin_cobro",
] as const;

/** Estados terminales de un turno (los que ya no van a cambiar). */
export const ESTADOS_TERMINALES_TURNO = [
  "completado",
  "ausente_paciente",
  "ausente_medico",
  "cancelado_paciente",
  "cancelado_medico",
] as const;

/**
 * Estados terminales de una consulta inmediata. `no_show_paciente` y
 * `medico_ausente` los escribe el plazo de 30 min (`resolver-vencidas.ts`).
 *
 * `interrumpida` existe en el enum pero NO entra acá: hoy no hay una sola línea
 * de código que lo escriba (quedó de una versión vieja del cron de reingreso) y
 * cero filas en las dos bases. Si algún día algo empieza a escribirlo, hay que
 * decidir si se factura ANTES de sumarlo — una consulta interrumpida sin
 * clasificar queda como pendiente para siempre y traba el sello de la semana.
 */
export const ESTADOS_TERMINALES_CONSULTA = [
  "completada",
  "no_show_paciente",
  "medico_ausente",
  "cancelada",
] as const;

/** Estados que declaran una ausencia, y de quién. Los mismos en los dos canales. */
const AUSENCIA_POR_ESTADO: Record<string, Clasificacion> = {
  ausente_paciente: "ausente_paciente",
  no_show_paciente: "ausente_paciente",
  ausente_medico: "ausente_profesional",
  medico_ausente: "ausente_profesional",
};

// ─────────────────────────────────────────────────────────────────────────────
// EL RELOJ — reconstrucción de intervalos desde video_presencia
// ─────────────────────────────────────────────────────────────────────────────

export interface EventoPresencia {
  rol: "medico" | "paciente" | "desconocido";
  identity: string;
  evento: "joined" | "left";
  /** Hora de llegada del webhook (columna `ocurrido_at`). */
  ocurrido_at: string;
  /** `raw.id` del evento de LiveKit, si viaja. Es la clave de dedup buena. */
  evento_id?: string | null;
}

export interface Reloj {
  medicoPrimerJoin: string | null;
  pacientePrimerJoin: string | null;
  segundosAmbosEnSala: number;
  intervalos: { desde: string; hasta: string }[];
}

/**
 * Reconstruye el solapamiento médico ∩ paciente.
 *
 * ── LAS TRES TRAMPAS QUE RESUELVE, Y CÓMO ────────────────────────────────────
 * 1. `joined` DUPLICADO (reintento del webhook): no puede inflar el reloj. Por
 *    eso la presencia se lleva con un Set de identidades abiertas y no con un
 *    contador: reentrar a un Set no hace nada. Además se descartan de entrada
 *    los eventos con el mismo `raw.id`.
 * 2. `left` FALTANTE (el navegador se cerró y el webhook nunca llegó): el
 *    intervalo abierto se cierra en `cierreISO` (el `completada_at` del
 *    encuentro). Si tampoco hay cierre, se cierra en el último evento visto —
 *    nunca "hasta hoy", que convertiría cualquier consulta colgada en oro.
 * 3. Un profesional con DOS dispositivos: dos identidades abiertas del mismo
 *    rol; el rol sigue presente hasta que se van las dos.
 *
 * `rol='desconocido'` (identity que el webhook no pudo mapear) se IGNORA: para
 * facturar hace falta saber quién estaba, y "alguien" no es una respuesta.
 */
export function reconstruirReloj(eventos: EventoPresencia[], cierreISO: string | null): Reloj {
  // Dedup por id de evento (cuando LiveKit lo mandó y el webhook lo guardó en raw).
  const vistos = new Set<string>();
  const utiles: EventoPresencia[] = [];
  for (const e of eventos) {
    if (e.rol !== "medico" && e.rol !== "paciente") continue;
    if (e.evento_id) {
      if (vistos.has(e.evento_id)) continue;
      vistos.add(e.evento_id);
    }
    const t = Date.parse(e.ocurrido_at);
    if (Number.isNaN(t)) continue; // dato roto: no se adivina
    utiles.push(e);
  }

  // Orden estable por instante. Ante empate, `left` ANTES que `joined`: si en
  // el mismo milisegundo uno se va y otro entra, el solapamiento no existió.
  // Contarlo al revés regalaría un intervalo de longitud cero… y, peor, uno
  // abierto por el resto de la consulta.
  const orden = [...utiles].sort((a, b) => {
    const d = Date.parse(a.ocurrido_at) - Date.parse(b.ocurrido_at);
    if (d !== 0) return d;
    if (a.evento === b.evento) return 0;
    return a.evento === "left" ? -1 : 1;
  });

  const abiertos = { medico: new Set<string>(), paciente: new Set<string>() };
  const intervalos: { desde: string; hasta: string }[] = [];
  // Se acumula en MILISEGUNDOS y se redondea UNA vez, al final. Redondear por
  // intervalo perdía hasta un segundo por tramo, y una consulta con
  // reconexiones (lo normal en un celular) se parte en varios: dos tramos de
  // 30,9 s son 61,8 s reales y daban 60; uno de 29,9 más otro de 30,9 son 60,8 s
  // y daban 59 — o sea `no_facturable_corta`. El umbral es exacto e inclusivo,
  // así que cada segundo perdido por redondeo es una consulta atendida que no
  // se factura.
  let msJuntos = 0;
  let ambosDesde: number | null = null;
  let medicoPrimerJoin: string | null = null;
  let pacientePrimerJoin: string | null = null;
  let ultimoEventoMs: number | null = null;

  const cerrar = (hastaMs: number) => {
    if (ambosDesde === null) return;
    msJuntos += Math.max(0, hastaMs - ambosDesde);
    intervalos.push({
      desde: new Date(ambosDesde).toISOString(),
      hasta: new Date(hastaMs).toISOString(),
    });
    ambosDesde = null;
  };

  for (const e of orden) {
    const ms = Date.parse(e.ocurrido_at);
    ultimoEventoMs = ms;
    const set = abiertos[e.rol as "medico" | "paciente"];

    if (e.evento === "joined") {
      set.add(e.identity);
      if (e.rol === "medico" && !medicoPrimerJoin) medicoPrimerJoin = new Date(ms).toISOString();
      if (e.rol === "paciente" && !pacientePrimerJoin) pacientePrimerJoin = new Date(ms).toISOString();
    } else {
      set.delete(e.identity);
    }

    const ambos = abiertos.medico.size > 0 && abiertos.paciente.size > 0;
    if (ambos && ambosDesde === null) ambosDesde = ms;
    if (!ambos && ambosDesde !== null) cerrar(ms);
  }

  // Intervalo abierto al final: se cierra en el cierre del encuentro. Si no hay
  // (o si es anterior al último evento, dato incoherente), en el último evento.
  if (ambosDesde !== null) {
    const cierreMs = cierreISO ? Date.parse(cierreISO) : NaN;
    const hasta =
      !Number.isNaN(cierreMs) && cierreMs >= (ultimoEventoMs ?? cierreMs)
        ? cierreMs
        : (ultimoEventoMs ?? ambosDesde);
    cerrar(hasta);
  }

  return {
    medicoPrimerJoin,
    pacientePrimerJoin,
    segundosAmbosEnSala: Math.floor(msJuntos / 1000),
    intervalos,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EL ÁRBOL — la decisión contractual
// ─────────────────────────────────────────────────────────────────────────────

export interface EntradaClasificacion {
  /** Estado terminal de la fila de `turnos` / `consultas`. */
  estado: string;
  segundosAmbosEnSala: number;
  documentosEmitidos: number;
  /**
   * Clasificación fijada A MANO desde el /admin interno (falla técnica
   * imputable). Gana sobre TODO, incluso sobre un ≥60 s: la falla técnica no
   * se auto-detecta con confianza contractual (spec §6.1) y, cuando un humano
   * la declara, el job no la puede pisar.
   */
  overrideManual?: Clasificacion | null;
}

/**
 * El árbol de decisión, en el orden de la spec §6.3.4. El orden IMPORTA: una
 * ausencia declarada gana sobre el reloj. Si un turno quedó `ausente_paciente`
 * y aun así hay 90 segundos de solapamiento (el profesional entró, esperó y el
 * cron lo resolvió después), lo que vale es la resolución: nadie fue atendido.
 */
export function clasificar(entrada: EntradaClasificacion): Clasificacion {
  if (entrada.overrideManual) return entrada.overrideManual;

  const porAusencia = AUSENCIA_POR_ESTADO[entrada.estado];
  if (porAusencia) return porAusencia;

  if (entrada.segundosAmbosEnSala >= SEGUNDOS_FACTURABLE || entrada.documentosEmitidos > 0) {
    return "facturable";
  }

  // El cajón de lo que no se factura y no es ausencia declarada: la consulta
  // que se cortó a los 20 segundos sin dejar nada, y también la cancelada a la
  // que nadie entró. No factura y no se cuenta como ausencia de nadie.
  return "no_facturable_corta";
}

/** ¿La clasificación entra en la factura? Una pregunta, un solo lugar. */
export function esFacturable(c: Clasificacion): boolean {
  return c === "facturable";
}

/** `canal_origen` → motor, validado. Fuera de la lista, el dato está roto. */
export function motorDeCanal(canal: string | null | undefined): Motor | null {
  if (canal === "acordado" || canal === "espontaneo" || canal === "ofrecido") return canal;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA CÁSCARA — el job que lee la base y escribe el contador
// ─────────────────────────────────────────────────────────────────────────────

/** Fila lista para el upsert (lo que el job compone por encuentro). */
export interface FilaMetering {
  tipo: "consulta" | "turno";
  recurso_id: string;
  motor: Motor;
  medico_id: string;
  paciente_id: string;
  especialidad: string | null;
  semana_ar: string;
  fecha_ar: string;
  medico_primer_join: string | null;
  paciente_primer_join: string | null;
  segundos_ambos_en_sala: number;
  intervalos: { desde: string; hasta: string }[];
  documentos_emitidos: number;
  /** Precio por consulta CONGELADO en la fila (ver la 014: la factura de un mes cerrado no se reescribe). */
  precio_centavos: number;
  clasificacion: Clasificacion;
  clasificacion_origen: "job";
  clasificado_at: string;
  /**
   * Encuentro de una reunión de DEMOSTRACIÓN (migraciones 025 y 027).
   *
   * Entra al contador MARCADO en vez de quedarse afuera. Afuera trababa el
   * sello (la precondición del cierre lo esperaba y el clasificador no se lo
   * iba a escribir nunca) y dejaba el panel de la institución en cero justo en
   * la escena que cierra el guion de la reunión.
   *
   * Quien filtra es la FACTURACIÓN, y solo ella.
   */
  es_demo: boolean;
}

/** Encuentro candidato, ya normalizado (turno y CI se ven igual desde acá). */
export interface EncuentroCandidato {
  tipo: "consulta" | "turno";
  id: string;
  /** Encuentro de una reunión de DEMOSTRACIÓN (migración 025): no se factura. */
  es_demo?: boolean;
  estado: string;
  canal_origen: string | null;
  medico_id: string;
  paciente_id: string;
  /** Instante del encuentro en ISO — de acá salen `fecha_ar` y `semana_ar`. */
  ocurridoISO: string;
  /** Cierre del encuentro: ancla del "≥15 min" y del intervalo abierto. */
  cierreISO: string | null;
}

/**
 * Saca de un lote los encuentros de una reunión de DEMOSTRACIÓN.
 *
 * Pura y exportada para poder probarla: es una línea, pero es la línea que
 * separa "consulta que la provincia pagó" de "consulta que ocurrió en una sala
 * de reuniones". Un `!` de menos acá le factura a un ministerio una atención
 * que nadie le pidió.
 *
 * ── FAIL-SAFE HACIA EL LADO CARO, DE VERDAD ──────────────────────────────────
 * Pasa SOLO lo que la base afirma que NO es demo (`=== false`), no todo lo que
 * no afirma que sí. La versión anterior decía esto mismo en el comentario y
 * hacía lo contrario (`!== true`): un `undefined` —dato ausente, fuente nueva,
 * columna que no vino en el SELECT— se colaba a la factura. La invariante
 * documentada y la implementada eran inversas, y el comentario es el contrato
 * que va a leer el próximo que reuse esto con otra query.
 *
 * De los dos errores posibles, el que se elige es facturar de menos.
 *
 * Es el cinturón EN MEMORIA de la facturación; el tirante es el predicado
 * `es_demo = false` en cada query de `facturacion.ts`.
 */
export function sinEncuentrosDemo<T extends { es_demo?: boolean }>(candidatos: T[]): T[] {
  return candidatos.filter((c) => c.es_demo === false);
}

export interface ResumenMetering {
  candidatos: number;
  clasificados: number;
  salteados_sellados: number;
  salteados_manual: number;
  salteados_recientes: number;
  /** Encuentros de una reunión de demostración: entran marcados, nunca a la factura. */
  marcados_demo: number;
  sin_motor: number;
  /** Encuentros que no entraron en esta corrida (los toma la siguiente). */
  pendientes: number;
  /**
   * De los pendientes, los que NUNCA se clasificaron. Es el número que importa:
   * si es > 0, el job no está dando abasto y hay encuentros que podrían salir
   * de la ventana de 14 días sin fila — o sea, sin factura.
   */
  pendientes_sin_fila: number;
  errores: number;
  por_clasificacion: Record<string, number>;
}

const resumenVacio = (): ResumenMetering => ({
  candidatos: 0,
  clasificados: 0,
  salteados_sellados: 0,
  salteados_manual: 0,
  salteados_recientes: 0,
  marcados_demo: 0,
  sin_motor: 0,
  pendientes: 0,
  pendientes_sin_fila: 0,
  errores: 0,
  por_clasificacion: {},
});

/** "2026-10-20" + "16:30:00" → instante real AR (offset fijo -03:00). */
function instanteAR(fecha: string, hora: string | null): string {
  const h = (hora ?? "00:00:00").length === 5 ? `${hora}:00` : (hora ?? "00:00:00").slice(0, 8);
  return new Date(`${fecha}T${h}-03:00`).toISOString();
}

/**
 * Compone la fila del contador para UN encuentro. Puro: recibe todo masticado
 * (presencia, documentos, especialidad) y no toca la base. Es el pegamento
 * entre el reloj y el árbol, y es lo que el test del mock 4 ejercita 98 veces.
 */
export function componerFila(params: {
  encuentro: EncuentroCandidato;
  eventos: EventoPresencia[];
  documentosEmitidos: number;
  especialidad: string | null;
  /**
   * Precio al que se factura ESTE encuentro. Para una fila nueva es el vigente;
   * para una que ya existe, el que ya tenía — la reclasificación por un webhook
   * tardío no puede cambiarle el precio a un encuentro de un mes anterior.
   */
  precioCentavos: number;
  /**
   * La fila que YA existe para este encuentro, si existe. Es el CINTURÓN (S5
   * del gate #405): el tirante es el filtro de `intocables` allá arriba en el
   * job, pero esta función es pública y no tenía forma de saber que estaba a
   * punto de componer el reemplazo de una fila sellada o fijada a mano. Un
   * caller nuevo —un backfill, un /admin, un script de corrección— que la
   * usara sin replicar el filtro produciría una fila con
   * `clasificacion_origen: 'job'` lista para pisar una decisión humana.
   *
   * Con esto, componer esa fila devuelve `null` y no hay nada que upsertear.
   */
  filaPrevia?: { clasificacion_origen?: unknown; facturado_periodo?: unknown } | null;
  ahoraISO?: string;
}): FilaMetering | null {
  const { encuentro } = params;
  if (params.filaPrevia && motivoIntocable(params.filaPrevia)) return null;
  const motor = motorDeCanal(encuentro.canal_origen);
  if (!motor) return null; // dato roto: no se inventa un motor

  const reloj = reconstruirReloj(params.eventos, encuentro.cierreISO);
  const clasificacion = clasificar({
    estado: encuentro.estado,
    segundosAmbosEnSala: reloj.segundosAmbosEnSala,
    documentosEmitidos: params.documentosEmitidos,
  });

  return {
    tipo: encuentro.tipo,
    recurso_id: encuentro.id,
    motor,
    medico_id: encuentro.medico_id,
    paciente_id: encuentro.paciente_id,
    especialidad: params.especialidad,
    semana_ar: lunesDeSemanaAR(encuentro.ocurridoISO),
    fecha_ar: fechaARdeISO(encuentro.ocurridoISO),
    medico_primer_join: reloj.medicoPrimerJoin,
    paciente_primer_join: reloj.pacientePrimerJoin,
    segundos_ambos_en_sala: reloj.segundosAmbosEnSala,
    intervalos: reloj.intervalos,
    documentos_emitidos: params.documentosEmitidos,
    precio_centavos: params.precioCentavos,
    clasificacion,
    clasificacion_origen: "job",
    clasificado_at: params.ahoraISO ?? new Date().toISOString(),
    // La marca viaja con la fila. La pone un trigger en la base (la 025) sobre
    // el encuentro, así que no depende de que ningún caller se acuerde; acá solo
    // se copia, y `=== true` la coerce: un dato ausente NO es "no es demo".
    es_demo: encuentro.es_demo === true,
  };
}

/**
 * ¿Este encuentro ya se puede clasificar? (spec §6.3.1)
 * Sí cuando pasaron `ESPERA_POST_CIERRE_MIN` minutos desde su cierre.
 */
export function yaSePuedeClasificar(cierreISO: string | null, ahoraMs: number): boolean {
  if (!cierreISO) return true; // sin cierre conocido no hay borrador que esperar
  const cierre = Date.parse(cierreISO);
  if (Number.isNaN(cierre)) return true;
  return ahoraMs - cierre >= ESPERA_POST_CIERRE_MIN * 60_000;
}

const DIA_MS = 24 * 3600_000;

/** Encuentros que una corrida escribe como mucho. Techo de tiempo, no de alcance. */
export const LIMITE_POR_CORRIDA = 500;

/**
 * ¿El job puede tocar esta fila que ya existe? (spec §6.6, borde "override
 * `falla_tecnica` no pisado")
 *
 * Es EL guard que corre en producción. El `overrideManual` de `clasificar()` es
 * la otra mitad de la misma regla —la que va a usar el /admin interno cuando
 * exista—, pero lo que hoy protege a una falla técnica declarada por un humano
 * es esta pregunta, y por eso está acá afuera y testeada.
 *
 * Devuelve POR QUÉ es intocable, no un booleano: el resumen del cron cuenta las
 * dos causas por separado y son cosas distintas — una fila sellada ya se
 * facturó, una manual la decidió una persona.
 */
export function motivoIntocable(fila: {
  clasificacion_origen?: unknown;
  facturado_periodo?: unknown;
}): "sellada" | "manual" | null {
  if (fila.facturado_periodo) return "sellada";
  if (fila.clasificacion_origen === "manual_admin") return "manual";
  return null;
}

/**
 * El job. Barre encuentros terminales recientes, arma su fila y la upsertea.
 *
 * Idempotente por `UNIQUE(tipo, recurso_id)`: correrlo diez veces seguidas da
 * el mismo resultado. Lo que NUNCA toca:
 *   · filas con `facturado_periodo` (ya facturadas — el trigger de la 014 es el
 *     cinturón, este guard es el tirante), y
 *   · filas con `clasificacion_origen='manual_admin'` (las fijó un humano).
 *
 * ── POR QUÉ EL LÍMITE NO PUEDE SER UN `.limit()` EN LA QUERY ─────────────────
 * Lo era, con `order('fecha', desc)`: el recorte se llevaba los encuentros MÁS
 * VIEJOS de la ventana. Como la corrida siguiente volvía a pedir los 500 más
 * nuevos, esos nunca entraban, y a los 14 días salían de la ventana y no se
 * clasificaban NUNCA — sin fila, sin panel y sin factura. Y sin señal:
 * `candidatos` decía 500 y `errores`, 0.
 *
 * Ahora la ventana se lee ENTERA (paginada) y el techo se aplica sobre una cola
 * priorizada: primero los que no tienen fila, del más viejo al más nuevo;
 * después, con lo que sobre, los ya clasificados hace más tiempo (que es como
 * siguen entrando los webhooks y los documentos que llegan tarde). Así la
 * corrida siguiente empieza por lo que quedó, y lo que queda pendiente se
 * cuenta y se dice.
 */
export async function correrMeteringClasificar(opciones?: {
  ahoraMs?: number;
  /** Ventana hacia atrás. 14 días cubre de sobra el atraso del webhook. */
  dias?: number;
  limite?: number;
}): Promise<ResumenMetering> {
  const admin = createAdminClient();
  const ahoraMs = opciones?.ahoraMs ?? Date.now();
  const dias = opciones?.dias ?? 14;
  const limite = opciones?.limite ?? LIMITE_POR_CORRIDA;
  const desdeISO = new Date(ahoraMs - dias * DIA_MS).toISOString();
  const desdeFecha = fechaARdeISO(desdeISO);
  const resumen = resumenVacio();

  // ── 1) Candidatos de los dos canales ───────────────────────────────────────
  let turnos: Record<string, unknown>[];
  let consultas: Record<string, unknown>[];
  try {
    [turnos, consultas] = await Promise.all([
      leerTodo<Record<string, unknown>>("turnos terminales de la ventana", (desde, hasta) =>
        admin
          .from("turnos")
          .select(
            "id, estado, canal_origen, medico_id, paciente_id, fecha, hora_inicio, completada_at, hora_fin, es_demo"
          )
          .in("estado", ESTADOS_TERMINALES_TURNO as unknown as string[])
          .gte("fecha", desdeFecha)
          .not("paciente_id", "is", null)
          .order("fecha", { ascending: true })
          .order("id", { ascending: true })
          .range(desde, hasta)
      ),
      leerTodo<Record<string, unknown>>("consultas terminales de la ventana", (desde, hasta) =>
        admin
          .from("consultas")
          .select("id, estado, canal_origen, medico_id, paciente_id, created_at, asignada_at, completada_at, es_demo")
          .in("estado", ESTADOS_TERMINALES_CONSULTA as unknown as string[])
          .gte("created_at", desdeISO)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(desde, hasta)
      ),
    ]);
  } catch (err) {
    console.error("[metering] Error leyendo candidatos:", err);
    resumen.errores++;
    return resumen;
  }

  const candidatos: EncuentroCandidato[] = [
    ...turnos.map((t) => ({
      tipo: "turno" as const,
      id: t.id as string,
      es_demo: t.es_demo === true,
      estado: t.estado as string,
      canal_origen: t.canal_origen as string | null,
      medico_id: t.medico_id as string,
      paciente_id: t.paciente_id as string,
      ocurridoISO: instanteAR(t.fecha as string, t.hora_inicio as string),
      // El cierre de un turno completado es `completada_at`; el de un turno que
      // nadie tomó, el fin de su franja (ahí lo resolvió el cron de vencidos).
      cierreISO: (t.completada_at as string | null) ?? instanteAR(t.fecha as string, t.hora_fin as string),
    })),
    ...consultas.map((c) => ({
      tipo: "consulta" as const,
      id: c.id as string,
      es_demo: c.es_demo === true,
      estado: c.estado as string,
      canal_origen: c.canal_origen as string | null,
      medico_id: c.medico_id as string,
      paciente_id: c.paciente_id as string,
      // La CI institucional no tiene pago: su instante es el de la asignación.
      ocurridoISO: (c.asignada_at as string | null) ?? (c.created_at as string),
      cierreISO: (c.completada_at as string | null) ?? null,
    })),
  ];
  // ── LO QUE PASÓ EN UNA DEMO ENTRA MARCADO, NO SE DESCARTA ─────────────────
  // Un encuentro de una reunión de venta es una atención de verdad —hubo
  // videollamada, hubo receta— pero no es servicio prestado a la institución:
  // el "paciente" era un participante de la reunión. No se factura, y de eso se
  // ocupa `facturacion.ts`, que no lee una sola fila sin `es_demo = false`.
  //
  // Pero DESCARTARLO acá, que es lo que se hacía antes, rompía dos cosas que
  // también salen de esta tabla:
  //   · el SELLO — su precondición cuenta todo encuentro terminal del período
  //     que debería tener fila, y esta era una fila que el clasificador no iba a
  //     escribir NUNCA. El cierre semanal y el mensual quedaban trabados de
  //     forma indefinida, acusando a un cron que estaba sano;
  //   · el PANEL de la institución, que lee todo de acá y se proyectaba en cero
  //     justo después de la videoconsulta en vivo que cierra el guion.
  //
  // La marca la pone un trigger en la base (migración 025), así que no depende
  // de que ningún caller se acuerde. Se cuenta cuántas hubo: un salto raro en
  // ese número es la señal de que quedó una demo sin limpiar.
  resumen.marcados_demo = candidatos.filter((c) => c.es_demo === true).length;

  resumen.candidatos = candidatos.length;
  if (candidatos.length === 0) return resumen;

  // ── 2) Los que todavía no cumplieron la espera post-cierre ─────────────────
  const maduros = candidatos.filter((c) => {
    const listo = yaSePuedeClasificar(c.cierreISO, ahoraMs);
    if (!listo) resumen.salteados_recientes++;
    return listo;
  });
  if (maduros.length === 0) return resumen;

  // ── 3) Filas que ya existen: selladas y manuales NO se tocan ───────────────
  //
  // Esta lectura NO se puede consumir a medias. Si falla y `intocables` queda
  // vacío, el upsert de más abajo pisa las filas que un humano fijó a mano como
  // falla técnica y les escribe `clasificacion_origen: 'job'`: la declaración
  // desaparece y el encuentro vuelve a ser facturable. Por eso corta la corrida
  // entera, igual que el paso 1.
  let existentes: Record<string, unknown>[];
  try {
    existentes = await leerTodoEnLotes<Record<string, unknown>>(
      "filas ya clasificadas",
      maduros.map((c) => c.id),
      (lote, desde, hasta) =>
        admin
          .from("encuentros_metering")
          .select(
            "tipo, recurso_id, clasificacion_origen, facturado_periodo, clasificado_at, precio_centavos"
          )
          .in("recurso_id", lote)
          .order("id", { ascending: true })
          .range(desde, hasta)
    );
  } catch (err) {
    console.error("[metering] Error leyendo las filas ya clasificadas:", err);
    resumen.errores++;
    return resumen;
  }
  const intocables = new Set<string>();
  const clasificadoAt = new Map<string, number>();
  /** Precio ya congelado en la fila: una reclasificación no lo puede mover. */
  const precioPrevio = new Map<string, number>();
  /** La fila previa entera, para el cinturón de `componerFila` (S5). */
  const previas = new Map<string, { clasificacion_origen?: unknown; facturado_periodo?: unknown }>();
  for (const f of existentes) {
    const clave = `${f.tipo}|${f.recurso_id}`;
    previas.set(clave, {
      clasificacion_origen: f.clasificacion_origen,
      facturado_periodo: f.facturado_periodo,
    });
    if (typeof f.precio_centavos === "number") precioPrevio.set(clave, f.precio_centavos);
    const motivo = motivoIntocable(f);
    if (motivo === "sellada") {
      intocables.add(clave);
      resumen.salteados_sellados++;
    } else if (motivo === "manual") {
      intocables.add(clave);
      resumen.salteados_manual++;
    } else {
      clasificadoAt.set(clave, Date.parse((f.clasificado_at as string) ?? "") || 0);
    }
  }
  const pendientes = maduros.filter((c) => !intocables.has(`${c.tipo}|${c.id}`));
  if (pendientes.length === 0) return resumen;

  // ── 3 bis) La cola: primero lo que nunca se clasificó, del más viejo al más
  // nuevo. Es lo único que se puede PERDER (a los 14 días sale de la ventana);
  // una fila que ya existe, en cambio, ya está en el panel y en la factura.
  const sinFila: EncuentroCandidato[] = [];
  const conFila: EncuentroCandidato[] = [];
  for (const c of pendientes) {
    (clasificadoAt.has(`${c.tipo}|${c.id}`) ? conFila : sinFila).push(c);
  }
  sinFila.sort((a, b) => Date.parse(a.ocurridoISO) - Date.parse(b.ocurridoISO));
  conFila.sort(
    (a, b) =>
      (clasificadoAt.get(`${a.tipo}|${a.id}`) ?? 0) - (clasificadoAt.get(`${b.tipo}|${b.id}`) ?? 0)
  );
  const cola = [...sinFila, ...conFila];
  const aClasificar = cola.slice(0, limite);
  resumen.pendientes = cola.length - aClasificar.length;
  resumen.pendientes_sin_fila = Math.max(0, sinFila.length - limite);
  if (aClasificar.length === 0) return resumen;

  const idsTurno = aClasificar.filter((c) => c.tipo === "turno").map((c) => c.id);
  const idsConsulta = aClasificar.filter((c) => c.tipo === "consulta").map((c) => c.id);

  // ── 4) Presencia, documentos y especialidades, en lote ─────────────────────
  //
  // Las cuatro lecturas cortan la corrida si fallan, por el mismo motivo que la
  // anterior y con una consecuencia peor: sin presencia, TODOS los encuentros
  // del lote quedan con reloj en cero y documentos en cero, el árbol los manda
  // a `no_facturable_corta`, el upsert los escribe con éxito y el cron devuelve
  // 200. Una factura corta que nadie ve — la falla silenciosa exacta, sobre el
  // número que se le cobra a la institución.
  //
  // Van en lotes de 100 ids porque `.in()` con 500 UUIDs arma una URL de ~19 KB
  // (no vuelve truncada: vuelve fallada), y paginadas porque un solo encuentro
  // con reconexiones deja decenas de filas de presencia.
  let presencia: Record<string, unknown>[];
  let docsTurno: Record<string, unknown>[];
  let docsConsulta: Record<string, unknown>[];
  let medicos: Record<string, unknown>[];
  try {
    [presencia, docsTurno, docsConsulta, medicos] = await Promise.all([
      leerTodoEnLotes<Record<string, unknown>>(
        "eventos de presencia en sala",
        aClasificar.map((c) => c.id),
        (lote, desde, hasta) =>
          admin
            .from("video_presencia")
            .select("tipo, recurso_id, rol, identity, evento, ocurrido_at, raw")
            .in("recurso_id", lote)
            .order("ocurrido_at", { ascending: true })
            .order("id", { ascending: true })
            .range(desde, hasta)
      ),
      leerTodoEnLotes<Record<string, unknown>>(
        "documentos de los turnos",
        idsTurno,
        (lote, desde, hasta) =>
          admin
            .from("documentos")
            .select("id, turno_id")
            .in("turno_id", lote)
            .order("id", { ascending: true })
            .range(desde, hasta)
      ),
      leerTodoEnLotes<Record<string, unknown>>(
        "documentos de las consultas",
        idsConsulta,
        (lote, desde, hasta) =>
          admin
            .from("documentos")
            .select("id, consulta_id")
            .in("consulta_id", lote)
            .order("id", { ascending: true })
            .range(desde, hasta)
      ),
      leerTodoEnLotes<Record<string, unknown>>(
        "especialidades de los profesionales",
        [...new Set(aClasificar.map((c) => c.medico_id))],
        (lote, desde, hasta) =>
          admin
            .from("medicos")
            .select("id, especialidad")
            .in("id", lote)
            .order("id", { ascending: true })
            .range(desde, hasta)
      ),
    ]);
  } catch (err) {
    console.error("[metering] Error leyendo presencia, documentos o especialidades:", err);
    resumen.errores++;
    return resumen;
  }

  const eventosPorRecurso = new Map<string, EventoPresencia[]>();
  for (const p of presencia) {
    const clave = `${p.tipo}|${p.recurso_id}`;
    const raw = p.raw as { id?: unknown } | null;
    const lista = eventosPorRecurso.get(clave) ?? [];
    lista.push({
      rol: p.rol as EventoPresencia["rol"],
      identity: p.identity as string,
      evento: p.evento as "joined" | "left",
      ocurrido_at: p.ocurrido_at as string,
      evento_id: typeof raw?.id === "string" ? raw.id : null,
    });
    eventosPorRecurso.set(clave, lista);
  }

  const docsPorRecurso = new Map<string, number>();
  for (const d of docsTurno) {
    const clave = `turno|${d.turno_id}`;
    docsPorRecurso.set(clave, (docsPorRecurso.get(clave) ?? 0) + 1);
  }
  for (const d of docsConsulta) {
    const clave = `consulta|${d.consulta_id}`;
    docsPorRecurso.set(clave, (docsPorRecurso.get(clave) ?? 0) + 1);
  }

  const especialidadPorMedico = new Map<string, string | null>();
  for (const m of medicos) {
    especialidadPorMedico.set(m.id as string, (m.especialidad as string | null) ?? null);
  }

  // ── 5) Componer y upsertear ────────────────────────────────────────────────
  const ahoraISO = new Date(ahoraMs).toISOString();
  // El precio vigente se lee UNA vez por corrida y solo lo estrenan las filas
  // nuevas: las que ya existían conservan el suyo (ver la 014).
  const precioVigente = Number((await getConfigInstitucion()).precio_consulta_centavos);
  const filas: FilaMetering[] = [];
  for (const encuentro of aClasificar) {
    const clave = `${encuentro.tipo}|${encuentro.id}`;
    const fila = componerFila({
      encuentro,
      eventos: eventosPorRecurso.get(clave) ?? [],
      documentosEmitidos: docsPorRecurso.get(clave) ?? 0,
      especialidad: especialidadPorMedico.get(encuentro.medico_id) ?? null,
      precioCentavos: precioPrevio.get(clave) ?? precioVigente,
      filaPrevia: previas.get(clave) ?? null,
      ahoraISO,
    });
    if (!fila) {
      // Acá solo puede ser el motor roto: los intocables se filtraron arriba y
      // el cinturón de `componerFila` es redundante por diseño. Si algún día
      // este contador empieza a subir sin datos rotos, el que sobra es el
      // filtro de arriba, no el cinturón.
      resumen.sin_motor++;
      continue;
    }
    filas.push(fila);
  }

  if (filas.length > 0) {
    const { error } = await admin
      .from("encuentros_metering")
      .upsert(filas, { onConflict: "tipo,recurso_id" });
    if (error) {
      console.error("[metering] Error en el upsert del contador:", error.message);
      resumen.errores++;
      return resumen;
    }
    resumen.clasificados = filas.length;
    for (const f of filas) {
      resumen.por_clasificacion[f.clasificacion] = (resumen.por_clasificacion[f.clasificacion] ?? 0) + 1;
    }
  }

  return resumen;
}
