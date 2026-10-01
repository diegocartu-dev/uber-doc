// El número de matrícula lo dice REFEPS, no el formulario (Diego, 01/10/2026).
//
// El profesional escribe su matrícula al registrarse y después valida su
// identidad con selfie + DNI. Con el DNI confirmado, REFEPS devuelve las
// matrículas que tiene ESA persona. Hasta hoy, si el número escrito no era
// idéntico a alguno de REFEPS, el registro quedaba trabado esperando que
// alguien del equipo lo corrigiera a mano — y en todos los casos reales era un
// dígito mal tipeado o una diferencia de formato.
//
// Un número escrito a mano no puede valer más que el del registro oficial para
// un DNI verificado por biometría. Así que lo escrito pasa a ser una PISTA
// (dice con qué jurisdicción quiere atender) y la matrícula que queda en la
// ficha —tipo, número y provincia— sale de REFEPS.
//
// Lo que este cruce impide —validarse con la identidad propia y quedarse con la
// matrícula de otro, o con una que no es de médico— sigue impedido: solo vale
// una matrícula de médico, habilitada, que REFEPS tiene para el DNI que acaba
// de probar quién es.
//
// Este archivo es puro (sin base ni red) para poder probarlo entero.

import { normalizarJurisdiccion } from "../jurisdicciones";
import { esMatriculaDeMedico } from "../refeps/profesion";

export { esMatriculaDeMedico };

export interface MatriculaDeRefeps {
  numero?: string | null;
  /** Jurisdicción que la otorgó, como la devuelve el Bus ("CABA", "Santa Fe"…). */
  tipo?: string | null;
  habilitada?: boolean | null;
  /** Profesión de su qualification ("Médico", …). Ver lib/refeps/profesion.ts. */
  profesion?: string | null;
}

export interface MatriculaDeclarada {
  tipo_matricula: string | null | undefined;
  numero_matricula: string | null | undefined;
  /**
   * La provincia de la MATRÍCULA. Ojo: `medicos.provincia` es otra cosa (el
   * onboarding guarda ahí la del consultorio) y no entra en este cruce.
   */
  provincia_matricula: string | null | undefined;
}

/** Cómo queda una matrícula en la ficha. */
export interface MatriculaEnFicha {
  tipo_matricula: "MN" | "MP";
  numero_matricula: string;
  provincia_matricula: string | null;
}

export type MotivoRevision =
  /** No se sabe qué jurisdicción declaró (MP sin provincia, tipo desconocido). */
  | "jurisdiccion_declarada_desconocida"
  /** REFEPS no tiene ninguna matrícula de la jurisdicción declarada. */
  | "jurisdiccion_no_figura"
  /** Las matrículas de esa jurisdicción figuran, pero ninguna habilitada. */
  | "no_habilitada"
  /** La habilitada de esa jurisdicción es de otra profesión, o REFEPS no dice de cuál. */
  | "sin_matricula_de_medico"
  /** Hay más de una matrícula de médico habilitada en esa jurisdicción: no se elige sola. */
  | "varias_en_jurisdiccion"
  /** El número escrito figura en más de una jurisdicción, ninguna la declarada. */
  | "numero_en_varias_jurisdicciones";

export type CruceMatricula =
  /** La ficha ya tiene exactamente una matrícula de médico habilitada suya. */
  | { resultado: "coincide" }
  /**
   * La ficha se corrige a `nueva`. `por`: "jurisdiccion" si el número era el
   * suyo y lo que estaba mal era MN/MP o la provincia; "numero" si el número
   * no figuraba y se toma el único de su jurisdicción.
   */
  | { resultado: "adoptar"; nueva: MatriculaEnFicha; jurisdiccion: string; por: "numero" | "jurisdiccion" }
  /** No hay una única respuesta. No se adivina. */
  | { resultado: "revisar"; motivo: MotivoRevision; jurisdiccion: string | null };

/** Textos de revisión que no son de matrícula (el panel los distingue). */
export const MOTIVO_DNI_NO_COINCIDE =
  "Didit aprobó la identidad, pero el DNI del documento escaneado no coincide con el DNI registrado en Docto.";
export const MOTIVO_SIN_PROFESIONAL_EN_REFEPS =
  "Didit aprobó la identidad, pero REFEPS no devolvió ningún profesional para ese DNI.";

/**
 * Forma comparable de un número de matrícula: mayúsculas, sin espacios, puntos
 * ni guiones. Las letras y los ceros a la izquierda SE CONSERVAN: "M1234" y
 * "K1234" son dos matrículas, y "01234" no es "1234" (para eso está la
 * adopción, que escribe el número tal como lo tiene REFEPS).
 */
export function normalizarNumeroMatricula(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[\s.\-]/g, "");
}

/**
 * Solo dígitos, sin ceros a la izquierda. NO sirve para decidir que dos
 * matrículas son la misma (ver normalizarNumeroMatricula); se usa para medir
 * qué tan distinto era lo que escribió.
 */
export function claveMatricula(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

/**
 * Jurisdicción que el profesional dijo tener. REFEPS informa la Matrícula
 * Nacional bajo la jurisdicción CABA (así llega en los datos del Bus).
 */
export function jurisdiccionDeclarada(d: MatriculaDeclarada): string | null {
  if (d.tipo_matricula === "MN") return "CABA";
  if (d.tipo_matricula === "MP") return normalizarJurisdiccion(d.provincia_matricula);
  return null;
}

/**
 * Cómo se guarda en la ficha una matrícula de REFEPS: la de CABA es la Nacional
 * (MN, sin provincia); las demás son provinciales (MP + provincia). `null` si la
 * jurisdicción no se reconoce o no trae número.
 */
export function declaradaDesdeRefeps(m: MatriculaDeRefeps): MatriculaEnFicha | null {
  const jurisdiccion = normalizarJurisdiccion(m.tipo);
  const numero = (m.numero ?? "").trim();
  if (!jurisdiccion || normalizarNumeroMatricula(numero) === "") return null;
  return jurisdiccion === "CABA"
    ? { tipo_matricula: "MN", numero_matricula: numero, provincia_matricula: null }
    : { tipo_matricula: "MP", numero_matricula: numero, provincia_matricula: jurisdiccion };
}

/**
 * ¿La ficha ya tiene ESA matrícula escrita como la tiene REFEPS (tipo, número y
 * provincia)? Una "MP de CABA" con el número de la Nacional no lo es: REFEPS la
 * tiene como MN.
 */
export function esLaDeLaFicha(declarada: MatriculaDeclarada, m: MatriculaDeRefeps): boolean {
  const enFicha = declaradaDesdeRefeps(m);
  if (!enFicha) return false;
  return (
    enFicha.tipo_matricula === declarada.tipo_matricula &&
    normalizarNumeroMatricula(enFicha.numero_matricula) === normalizarNumeroMatricula(declarada.numero_matricula) &&
    normalizarJurisdiccion(enFicha.provincia_matricula) === normalizarJurisdiccion(declarada.provincia_matricula)
  );
}

/** Matrícula de médico, habilitada, con número y jurisdicción reconocibles. */
export function esUtilizable(m: MatriculaDeRefeps): boolean {
  return m.habilitada === true && esMatriculaDeMedico(m) && declaradaDesdeRefeps(m) !== null;
}

/**
 * Cruza la matrícula declarada con las que REFEPS tiene para el DNI verificado.
 *
 *  1. El número escrito es, tal cual, una matrícula de médico habilitada suya:
 *     - y la ficha ya la tiene escrita como REFEPS (tipo y provincia) → `coincide`;
 *     - en la jurisdicción que declaró pero escrita distinto (una "MP de CABA"
 *       que es la Nacional), o en UNA sola otra jurisdicción → `adoptar` esa
 *       (se corrigen tipo y provincia, el número queda);
 *     - en varias otras → `revisar`.
 *  2. Si no figura tal cual: en la jurisdicción declarada, REFEPS tiene UNA sola
 *     matrícula de médico habilitada → `adoptar` esa. Si no, `revisar` con el
 *     motivo concreto.
 */
export function cruzarMatricula(
  declarada: MatriculaDeclarada,
  deRefeps: MatriculaDeRefeps[] | null | undefined
): CruceMatricula {
  const todas = (deRefeps ?? []).filter((m) => normalizarNumeroMatricula(m?.numero) !== "");
  const utilizables = todas.filter(esUtilizable);
  const jurisdiccion = jurisdiccionDeclarada(declarada);
  const escrito = normalizarNumeroMatricula(declarada.numero_matricula);

  // 1 · El número escrito, tal cual.
  if (escrito !== "") {
    const exactas = utilizables.filter((m) => normalizarNumeroMatricula(m.numero) === escrito);
    if (exactas.some((m) => esLaDeLaFicha(declarada, m))) {
      return { resultado: "coincide" };
    }
    const enSuJurisdiccion = exactas.find((m) => normalizarJurisdiccion(m.tipo) === jurisdiccion);
    if (enSuJurisdiccion) {
      return {
        resultado: "adoptar",
        nueva: declaradaDesdeRefeps(enSuJurisdiccion) as MatriculaEnFicha,
        jurisdiccion: jurisdiccion as string,
        por: "jurisdiccion",
      };
    }
    const distintas = new Map<string, MatriculaDeRefeps>();
    for (const m of exactas) distintas.set(normalizarJurisdiccion(m.tipo) as string, m);
    if (distintas.size === 1) {
      const [[juris, m]] = [...distintas];
      return { resultado: "adoptar", nueva: declaradaDesdeRefeps(m) as MatriculaEnFicha, jurisdiccion: juris, por: "jurisdiccion" };
    }
    if (distintas.size > 1) {
      return { resultado: "revisar", motivo: "numero_en_varias_jurisdicciones", jurisdiccion };
    }
  }

  // 2 · No figura tal cual: la única de médico habilitada de su jurisdicción.
  if (!jurisdiccion) {
    return { resultado: "revisar", motivo: "jurisdiccion_declarada_desconocida", jurisdiccion: null };
  }
  const deEsa = todas.filter((m) => normalizarJurisdiccion(m.tipo) === jurisdiccion);
  if (deEsa.length === 0) {
    return { resultado: "revisar", motivo: "jurisdiccion_no_figura", jurisdiccion };
  }
  if (!deEsa.some((m) => m.habilitada === true)) {
    return { resultado: "revisar", motivo: "no_habilitada", jurisdiccion };
  }
  // La misma matrícula puede venir repetida (una fila por título): se cuenta una vez.
  const medicas = new Map<string, MatriculaDeRefeps>();
  for (const m of deEsa) {
    if (esUtilizable(m)) medicas.set(normalizarNumeroMatricula(m.numero), m);
  }
  if (medicas.size === 0) {
    return { resultado: "revisar", motivo: "sin_matricula_de_medico", jurisdiccion };
  }
  if (medicas.size > 1) {
    return { resultado: "revisar", motivo: "varias_en_jurisdiccion", jurisdiccion };
  }
  const [m] = [...medicas.values()];
  return { resultado: "adoptar", nueva: declaradaDesdeRefeps(m) as MatriculaEnFicha, jurisdiccion, por: "numero" };
}

/** "MN 123456" / "MP 1234 (Salta)": cómo se nombra una matrícula en pantalla. */
export function etiquetaMatricula(m: {
  tipo_matricula: string | null | undefined;
  numero_matricula: string | null | undefined;
  provincia_matricula?: string | null;
}): string {
  return `${m.tipo_matricula ?? ""} ${m.numero_matricula ?? ""}${m.provincia_matricula ? ` (${m.provincia_matricula})` : ""}`.trim();
}

function nombreJurisdiccion(jurisdiccion: string | null): string {
  return jurisdiccion === "CABA" ? "Matrícula Nacional" : `matrícula de ${jurisdiccion}`;
}

/**
 * El slug del perfil público termina en tipo + número ("…-MN123456"). Si la
 * matrícula cambia, el slug viejo publicaría el número equivocado en la URL.
 * Devuelve el slug corregido, o `null` si no termina en la matrícula vieja (no
 * se toca lo que no se reconoce). Del número nuevo van solo letras y dígitos:
 * una barra o un espacio romperían la ruta.
 */
export function slugConMatricula(
  slug: string | null | undefined,
  vieja: { tipo: string | null | undefined; numero: string | null | undefined },
  nueva: { tipo: string; numero: string }
): string | null {
  if (!slug || !vieja.tipo || !vieja.numero) return null;
  const sufijoViejo = `-${vieja.tipo}${vieja.numero}`;
  if (!slug.endsWith(sufijoViejo)) return null;
  const numeroLimpio = nueva.numero.replace(/[^A-Za-z0-9]/g, "");
  if (!numeroLimpio) return null;
  return slug.slice(0, slug.length - sufijoViejo.length) + `-${nueva.tipo}${numeroLimpio}`;
}

/** Texto para el panel cuando el cruce no se puede cerrar solo. */
export function motivoRevisionHumano(motivo: MotivoRevision, jurisdiccion: string | null): string {
  const base = "Didit aprobó la identidad, pero la matrícula no se pudo confirmar sola: ";
  const cual = nombreJurisdiccion(jurisdiccion);
  switch (motivo) {
    case "jurisdiccion_declarada_desconocida":
      return base + "no declaró de qué provincia es su matrícula y el número no figura en REFEPS para ese DNI.";
    case "jurisdiccion_no_figura":
      return base + `declaró una ${cual}, y REFEPS no tiene ninguna de esa jurisdicción para ese DNI.`;
    case "no_habilitada":
      return base + `la ${cual} que REFEPS tiene para ese DNI no figura habilitada.`;
    case "sin_matricula_de_medico":
      return base + `la ${cual} habilitada que REFEPS tiene para ese DNI no figura como de médico.`;
    case "varias_en_jurisdiccion":
      return base + `REFEPS tiene más de una ${cual} de médico habilitada para ese DNI y ninguna es la que declaró.`;
    case "numero_en_varias_jurisdicciones":
      return base + "el número que declaró figura en más de una jurisdicción para ese DNI, y en ninguna de ellas es la que declaró.";
  }
}
