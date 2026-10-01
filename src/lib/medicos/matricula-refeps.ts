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
// (dice con qué jurisdicción quiere atender) y el número sale de REFEPS.
//
// No abre ninguna puerta: la matrícula que se adopta pertenece, por
// construcción, a la persona que acaba de probar quién es. Lo que este cruce
// impide —validarse con la identidad propia y quedarse con la matrícula de
// otro— sigue impedido.
//
// Este archivo es puro (sin base ni red) para poder probarlo entero.

import { normalizarJurisdiccion } from "../jurisdicciones";

export interface MatriculaDeRefeps {
  numero?: string | null;
  /** Jurisdicción que la otorgó, como la devuelve el Bus ("CABA", "Santa Fe"…). */
  tipo?: string | null;
  habilitada?: boolean | null;
  /**
   * Profesión a la que corresponde ("Médico", "Técnico en hemoterapia"…). REFEPS
   * devuelve bajo un mismo DNI las matrículas de TODAS las profesiones de la persona.
   */
  profesion?: string | null;
}

export interface MatriculaDeclarada {
  tipo_matricula: string | null | undefined;
  numero_matricula: string | null | undefined;
  provincia_matricula: string | null | undefined;
}

export type MotivoRevision =
  /** No se sabe qué jurisdicción declaró (MP sin provincia, tipo desconocido). */
  | "jurisdiccion_declarada_desconocida"
  /** REFEPS no tiene ninguna matrícula de la jurisdicción declarada. */
  | "jurisdiccion_no_figura"
  /** La matrícula de esa jurisdicción figura, pero no está habilitada. */
  | "no_habilitada"
  /** La habilitada de esa jurisdicción es de otra profesión, o REFEPS no dice de cuál. */
  | "sin_matricula_de_medico"
  /** Hay más de una matrícula de médico habilitada en esa jurisdicción: no se elige sola. */
  | "varias_en_jurisdiccion";

export type CruceMatricula =
  | { resultado: "coincide" }
  | { resultado: "adoptar"; numero: string; jurisdiccion: string }
  | { resultado: "revisar"; motivo: MotivoRevision; jurisdiccion: string | null };

/**
 * Clave de comparación de un número de matrícula: solo dígitos, sin ceros a la
 * izquierda. Algunas provincias anteponen letra y cero ("M01234") y el
 * profesional escribe "1234": es el mismo número.
 */
export function claveMatricula(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

/**
 * ¿La matrícula es de médico? Solo esas se adoptan o se eligen: una persona
 * puede tener además una matrícula de otra profesión, y ponerla en la ficha
 * haría salir sus recetas con ese número. Sin dato de profesión no se adopta.
 */
export function esMatriculaDeMedico(m: MatriculaDeRefeps): boolean {
  const p = (m.profesion ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return p === "medico" || p === "medica";
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
 * Cruza la matrícula declarada con las que REFEPS tiene para el DNI verificado.
 *
 *  - `coincide`: el número declarado es uno de los de REFEPS (cualquier
 *    jurisdicción, habilitada o no — igual que el cruce original).
 *  - `adoptar`: no coincide, pero en la jurisdicción declarada REFEPS tiene
 *    exactamente UNA matrícula de médico habilitada. Esa es la suya.
 *  - `revisar`: no hay una única respuesta. No se adivina.
 */
export function cruzarMatricula(
  declarada: MatriculaDeclarada,
  deRefeps: MatriculaDeRefeps[] | null | undefined
): CruceMatricula {
  const matriculas = (deRefeps ?? []).filter((m) => claveMatricula(m?.numero) !== "");
  const clave = claveMatricula(declarada.numero_matricula);

  if (clave !== "" && matriculas.some((m) => claveMatricula(m.numero) === clave)) {
    return { resultado: "coincide" };
  }

  const jurisdiccion = jurisdiccionDeclarada(declarada);
  if (!jurisdiccion) {
    return { resultado: "revisar", motivo: "jurisdiccion_declarada_desconocida", jurisdiccion: null };
  }

  const deEsaJurisdiccion = matriculas.filter((m) => normalizarJurisdiccion(m.tipo) === jurisdiccion);
  if (deEsaJurisdiccion.length === 0) {
    return { resultado: "revisar", motivo: "jurisdiccion_no_figura", jurisdiccion };
  }

  const habilitadasDeEsaJurisdiccion = deEsaJurisdiccion.filter((m) => m.habilitada === true);
  if (habilitadasDeEsaJurisdiccion.length === 0) {
    return { resultado: "revisar", motivo: "no_habilitada", jurisdiccion };
  }

  // La misma matrícula puede venir repetida (una fila por título): se cuenta
  // una vez. Se compara el texto ENTERO, no solo los dígitos: "M1234" y "K1234"
  // son dos matrículas distintas y entre dos no se elige sola.
  const habilitadas = new Set<string>();
  for (const m of habilitadasDeEsaJurisdiccion) {
    if (!esMatriculaDeMedico(m)) continue;
    habilitadas.add((m.numero ?? "").trim().toUpperCase().replace(/\s+/g, ""));
  }
  if (habilitadas.size === 0) {
    return { resultado: "revisar", motivo: "sin_matricula_de_medico", jurisdiccion };
  }
  if (habilitadas.size > 1) {
    return { resultado: "revisar", motivo: "varias_en_jurisdiccion", jurisdiccion };
  }
  const [numero] = [...habilitadas];
  return { resultado: "adoptar", numero, jurisdiccion };
}

/**
 * Cómo se guarda en la ficha una matrícula elegida de REFEPS: la de CABA es la
 * Nacional (MN, sin provincia); las demás son provinciales (MP + provincia).
 * `null` si la jurisdicción no se reconoce o no trae número.
 */
export function declaradaDesdeRefeps(
  m: MatriculaDeRefeps
): { tipo_matricula: "MN" | "MP"; numero_matricula: string; provincia_matricula: string | null } | null {
  const jurisdiccion = normalizarJurisdiccion(m.tipo);
  const numero = (m.numero ?? "").trim();
  if (!jurisdiccion || claveMatricula(numero) === "") return null;
  return jurisdiccion === "CABA"
    ? { tipo_matricula: "MN", numero_matricula: numero, provincia_matricula: null }
    : { tipo_matricula: "MP", numero_matricula: numero, provincia_matricula: jurisdiccion };
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
  switch (motivo) {
    case "jurisdiccion_declarada_desconocida":
      return base + "no declaró de qué provincia es su matrícula y el número no figura en REFEPS para ese DNI.";
    case "jurisdiccion_no_figura":
      return base + `declaró una matrícula de ${jurisdiccion}, y REFEPS no tiene ninguna de esa jurisdicción para ese DNI.`;
    case "no_habilitada":
      return base + `la matrícula de ${jurisdiccion} que REFEPS tiene para ese DNI no figura habilitada.`;
    case "sin_matricula_de_medico":
      return base + `la matrícula habilitada de ${jurisdiccion} que REFEPS tiene para ese DNI no figura como de médico.`;
    case "varias_en_jurisdiccion":
      return base + `REFEPS tiene más de una matrícula de médico habilitada de ${jurisdiccion} para ese DNI y ninguna es la que declaró.`;
  }
}
