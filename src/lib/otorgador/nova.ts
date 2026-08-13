// src/lib/otorgador/nova.ts
// LA CAPA CONVERSACIONAL DE NOVA — V1, honesta (spec institucional §4.6,
// 03-spec §5). SOLO instancia institucional.
//
// ── QUÉ ES ESTO Y QUÉ NO ES ──────────────────────────────────────────────────
// NO hay un LLM en runtime. Nova V1 entiende UNA cosa —"tal profesional no
// puede atender tal día"— con un parser acotado, y todo lo demás lo contesta
// diciendo que todavía no lo sabe hacer. Eso es deliberado y es lo contrario
// de un chat que simula entender: en una demo frente a un ministerio, un
// asistente que inventa una respuesta a un pedido que no puede cumplir es peor
// que uno que dice "esto sí, esto no".
//
// Lo que sí queda listo es la INTERFAZ: el motor de reprogramación es una
// función con parámetros (`planReprogramacionMasiva` + el endpoint) y la
// identidad de operador ya contempla `tipo='ia'` con API key. El día que entre
// una IA de verdad, reemplaza este parser y llama exactamente lo mismo, con su
// propia identidad y la misma auditoría — no hay un camino especial para ella.
//
// ── POR QUÉ EL PARSER ES PURO ────────────────────────────────────────────────
// Porque es la parte que se equivoca. Recibe el texto y el padrón ya leído, y
// devuelve una decisión; la DB queda afuera y los casos raros ("el martes" sin
// número, dos profesionales con el mismo apellido, una fecha que ya pasó) se
// prueban en un test unitario y no en la demo.

const DIAS_SEMANA = [
  ["domingo"],
  ["lunes"],
  ["martes"],
  ["miercoles", "miércoles"],
  ["jueves"],
  ["viernes"],
  ["sabado", "sábado"],
];

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "setiembre", "octubre", "noviembre", "diciembre",
];

/** Minúsculas sin tildes y sin puntuación: para comparar apellidos y días. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:¿?¡!()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palabras que nunca identifican a una persona (títulos y muletillas del pedido). */
const RUIDO = new Set([
  "el", "la", "los", "las", "un", "una", "de", "del", "y", "o", "a", "en", "que",
  "dr", "dra", "doctor", "doctora", "lic", "licenciado", "licenciada",
  "no", "puede", "atender", "atiende", "va", "poder", "esta", "este", "proximo",
  "dia", "turno", "turnos", "agenda", "reprogramar", "reasignar", "mover", "cancelar",
  "por", "favor", "me", "avisa", "aviso", "hoy", "manana", "semana", "viene",
]);

export interface ProfesionalConocido {
  id: string;
  /** Nombre completo tal como se muestra ("Dra. Laura Fernández"). */
  nombre: string;
  especialidad: string;
}

export type Interpretacion =
  | { tipo: "reprogramar_dia"; medicoId: string; medicoNombre: string; fecha: string }
  | { tipo: "falta_fecha"; medicoId: string; medicoNombre: string }
  | { tipo: "falta_profesional" }
  | { tipo: "ambiguo"; candidatos: ProfesionalConocido[] }
  | { tipo: "no_entiendo" };

/**
 * Resuelve la fecha que menciona el texto, en hora AR.
 *
 * Formas que entiende, en este orden: `20/10`, `20-10`, `20 de octubre`,
 * `martes 20`, `martes` a secas (el próximo, o hoy si hoy es martes),
 * `mañana`, `hoy`, y un día con artículo (`el 20`).
 *
 * Devuelve "AAAA-MM-DD" o `null`.
 *
 * ── LA REGLA: ANTE LA DUDA, NULL ─────────────────────────────────────────────
 * `null` no es un fracaso: cae en `falta_fecha` y Nova PREGUNTA. Entender mal
 * QUÉ DÍA es uno de los dos errores caros de esta pantalla —el otro es entender
 * mal A QUIÉN— y a la agenda de un profesional no se la vacía por una
 * corazonada. Preguntar cuesta una frase; reprogramar el día equivocado cuesta
 * ocho llamados del call center.
 *
 * Tres cosas que ANTES adivinaban mal (corrido de verdad con hoy=2026-10-25):
 *   · `"no puede el 20/10"` devolvía **2026-10-20**, una fecha PASADA, pese a
 *     que el docstring juraba que nunca. La rama del año siguiente exigía
 *     `mes < mesHoy`, que no se cumple dentro del mismo mes.
 *   · `"20/10/2020"` devolvía **2020-10-20**: con año explícito no había ningún
 *     guard. Y las dos ramas de fecha pasada se contradecían entre sí
 *     (`20/10` devolvía el pasado y `20 de octubre` saltaba al 2027).
 *   · `"no puede atender a las 16"` devolvía **2026-11-16**: el regex del día
 *     suelto agarraba CUALQUIER número de 1-2 dígitos, así que una frase
 *     normalísima se interpretaba como reprogramar el día entero del 16/11.
 *   · `"el martes 20"` con el 20 ya pasado devolvía 2026-11-20, que es
 *     **viernes**: cuando había número, el día de la semana se ignoraba en vez
 *     de usarse para verificar.
 *
 * Una fecha PASADA nunca se "corrige" saltando al año siguiente: reprogramar
 * algo a once meses vista no es lo que quiso decir nadie, y la oferta de
 * candidatos es de la semana AR corriente. Se pregunta.
 */
export function fechaDelTexto(texto: string, hoyAr: string): string | null {
  const t = normalizar(texto);
  const [anioHoy, mesHoy] = hoyAr.split("-").map(Number);

  const armar = (anio: number, mes: number, dia: number): string | null => {
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    const iso = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    // Fecha inexistente (31 de febrero): el Date la corre de mes.
    const d = new Date(`${iso}T12:00:00Z`);
    if (d.getUTCDate() !== dia || d.getUTCMonth() + 1 !== mes) return null;
    return iso;
  };

  /** Una sola puerta de salida: lo pasado no sale, se pregunta. */
  const soloFuturo = (iso: string | null): string | null => (iso && iso >= hoyAr ? iso : null);

  /** Ese día del mes: el de este mes si todavía no pasó, si no el del que viene. */
  const proximoConDia = (dia: number): string | null => {
    const esteMes = armar(anioHoy, mesHoy, dia);
    if (esteMes && esteMes >= hoyAr) return esteMes;
    const mesQueViene = mesHoy === 12 ? 1 : mesHoy + 1;
    return soloFuturo(armar(mesHoy === 12 ? anioHoy + 1 : anioHoy, mesQueViene, dia));
  };

  const diaDeLaSemanaDe = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();

  if (/\bhoy\b/.test(t)) return hoyAr;
  if (/\bmanana\b/.test(t)) {
    const d = new Date(`${hoyAr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  // 20/10 · 20-10 · 20/10/2026
  const numerica = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numerica) {
    const dia = Number(numerica[1]);
    const mes = Number(numerica[2]);
    const anio = numerica[3]
      ? Number(numerica[3].length === 2 ? `20${numerica[3]}` : numerica[3])
      : anioHoy;
    // Con año explícito, lo que dijo es lo que vale — y si ya pasó, se pregunta.
    return soloFuturo(armar(anio, mes, dia));
  }

  // 20 de octubre
  const conMes = t.match(/\b(\d{1,2})\s+de\s+([a-z]+)/);
  if (conMes) {
    const idx = MESES.indexOf(conMes[2]);
    if (idx >= 0) {
      const mes = idx >= 9 ? idx : idx + 1; // "setiembre" comparte número con "septiembre"
      return soloFuturo(armar(anioHoy, mes, Number(conMes[1])));
    }
  }

  // martes 20 · martes (el próximo)
  const diaSemana = DIAS_SEMANA.findIndex((nombres) =>
    nombres.some((n) => new RegExp(`\\b${n}\\b`).test(t))
  );
  if (diaSemana >= 0) {
    // El número tiene que venir PEGADO al día de la semana ("martes 20"), no
    // ser cualquier número suelto de la frase.
    let conNumero: RegExpMatchArray | null = null;
    for (const n of DIAS_SEMANA[diaSemana]) {
      conNumero = t.match(new RegExp(`\\b${n}\\s+(?:el\\s+)?(\\d{1,2})\\b`));
      if (conNumero) break;
    }
    if (conNumero) {
      const iso = proximoConDia(Number(conNumero[1]));
      // Dijo las dos cosas: el número y el día de la semana. Si no coinciden,
      // una de las dos está mal y no hay forma de saber cuál — se pregunta.
      return iso && diaDeLaSemanaDe(iso) === diaSemana ? iso : null;
    }
    const d = new Date(`${hoyAr}T12:00:00Z`);
    const delta = (diaSemana - d.getUTCDay() + 7) % 7;
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  // "el 20" — con artículo. Sin él, "a las 16" se leía como el día 16.
  const soloDia = t.match(/\bel\s+(\d{1,2})\b/);
  if (soloDia) return proximoConDia(Number(soloDia[1]));

  return null;
}

/**
 * ¿A qué profesional del padrón se refiere el texto?
 *
 * Compara PALABRAS del nombre (sin título, sin tildes) con las palabras del
 * mensaje. Gana el que empareja más palabras; si dos empatan —dos apellidos
 * iguales, que en una provincia pasa— NO se elige uno: se pregunta. Elegir mal
 * a quién se le vacía la agenda es exactamente el error que no se puede
 * cometer en silencio.
 */
export function profesionalDelTexto(
  texto: string,
  padron: ProfesionalConocido[]
): { unico: ProfesionalConocido } | { candidatos: ProfesionalConocido[] } | null {
  const palabras = new Set(
    normalizar(texto)
      .split(" ")
      .filter((p) => p.length >= 3 && !RUIDO.has(p) && !/^\d+$/.test(p))
  );
  if (palabras.size === 0) return null;

  let mejor = 0;
  const puntajes = padron.map((p) => {
    const propias = normalizar(p.nombre)
      .split(" ")
      .filter((w) => w.length >= 3 && !RUIDO.has(w));
    const puntaje = propias.filter((w) => palabras.has(w)).length;
    if (puntaje > mejor) mejor = puntaje;
    return { p, puntaje };
  });
  if (mejor === 0) return null;

  const ganadores = puntajes.filter((x) => x.puntaje === mejor).map((x) => x.p);
  return ganadores.length === 1 ? { unico: ganadores[0] } : { candidatos: ganadores };
}

/** El parser completo: texto + padrón + hoy → qué hacer. */
export function interpretarPedido(
  texto: string,
  padron: ProfesionalConocido[],
  hoyAr: string
): Interpretacion {
  const quien = profesionalDelTexto(texto, padron);
  if (!quien) {
    // Sin profesional reconocido no se puede hacer nada, ni siquiera si la
    // fecha está clarísima.
    return /reprogram|reasign|mover|no puede|no va a poder/.test(normalizar(texto))
      ? { tipo: "falta_profesional" }
      : { tipo: "no_entiendo" };
  }
  if ("candidatos" in quien) return { tipo: "ambiguo", candidatos: quien.candidatos };

  const fecha = fechaDelTexto(texto, hoyAr);
  if (!fecha) {
    return { tipo: "falta_fecha", medicoId: quien.unico.id, medicoNombre: quien.unico.nombre };
  }
  return {
    tipo: "reprogramar_dia",
    medicoId: quien.unico.id,
    medicoNombre: quien.unico.nombre,
    fecha,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EL COPY — el de 03-spec §5.3, textual
// ─────────────────────────────────────────────────────────────────────────────

/** El único chip de sugerencia de V1: Nova hace una cosa y la dice. */
export const CHIP_SUGERENCIA = "Reprogramar un día de un profesional";

/**
 * La frase de la propuesta. La última oración es de COMPORTAMIENTO, no de
 * cortesía: la propuesta no toca la agenda hasta el confirm, y eso es cierto
 * (ver el encabezado de `reprogramar-masivo.ts`).
 */
export function textoPropuesta(params: {
  medicoNombre: string;
  turnos: number;
  fechaCorta: string;
  especialidad: string;
}): string {
  const { medicoNombre, turnos, fechaCorta, especialidad } = params;
  return (
    `Entendido. ${medicoNombre} tiene ${turnos} turno${turnos === 1 ? "" : "s"} asignado${turnos === 1 ? "" : "s"} ` +
    `el ${fechaCorta}. Preparé una propuesta para reasignarlos entre los profesionales de ${especialidad} ` +
    `con lugares libres. Revisala antes de confirmar — todavía no cambié nada.`
  );
}

/** El cierre, después de ejecutar. Nombra lo que quedó sin resolver. */
export function textoCierre(params: {
  reasignados: number;
  pacientes: number;
  profesionales: number;
  manuales: string[];
}): string {
  const { reasignados, pacientes, profesionales, manuales } = params;
  const base =
    `Listo. Reasigné ${reasignados} turno${reasignados === 1 ? "" : "s"} y avisé a ` +
    `${pacientes === 1 ? "1 paciente" : `los ${pacientes} pacientes`} y a ` +
    `${profesionales === 1 ? "1 profesional" : `los ${profesionales} profesionales`}.`;
  if (manuales.length === 0) return base;
  // "en el turnero" era una promesa que nadie cumplía: el turnero no pinta
  // ninguna marca. Lo que sí existe es la fila en `asignaciones` que deja
  // `registrarGestionManual()`, o sea que lo irresoluble queda AUDITADO — que
  // era la mitad que faltaba de la promesa del mock. Mientras el turnero no lo
  // pinte, el copy no lo afirma.
  const quienes =
    manuales.length === 1
      ? `${manuales[0]} quedó`
      : `${manuales.slice(0, -1).join(", ")} y ${manuales[manuales.length - 1]} quedaron`;
  return `${base} ${quienes} para gestión manual del call center: los dejé registrados.`;
}
