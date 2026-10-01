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
  /** Hay más de una matrícula habilitada en esa jurisdicción: no se elige sola. */
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
 *    exactamente UNA matrícula habilitada. Esa es la suya.
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

  // La misma matrícula puede venir repetida (una fila por título): se cuenta
  // por número, no por fila.
  const habilitadas = new Map<string, string>();
  for (const m of deEsaJurisdiccion) {
    if (m.habilitada !== true) continue;
    const k = claveMatricula(m.numero);
    if (!habilitadas.has(k)) habilitadas.set(k, (m.numero ?? "").trim());
  }
  if (habilitadas.size === 0) {
    return { resultado: "revisar", motivo: "no_habilitada", jurisdiccion };
  }
  if (habilitadas.size > 1) {
    return { resultado: "revisar", motivo: "varias_en_jurisdiccion", jurisdiccion };
  }
  const [numero] = [...habilitadas.values()];
  return { resultado: "adoptar", numero, jurisdiccion };
}

/**
 * El slug del perfil público termina en tipo + número ("…-MN123456"). Si la
 * matrícula cambia, el slug viejo publicaría el número equivocado en la URL.
 * Devuelve el slug corregido, o `null` si no termina en el número viejo (no se
 * toca lo que no se reconoce).
 */
export function slugConMatricula(
  slug: string | null | undefined,
  tipo: string | null | undefined,
  numeroViejo: string | null | undefined,
  numeroNuevo: string
): string | null {
  if (!slug || !tipo || !numeroViejo) return null;
  const sufijoViejo = `-${tipo}${numeroViejo}`;
  if (!slug.endsWith(sufijoViejo)) return null;
  return slug.slice(0, slug.length - sufijoViejo.length) + `-${tipo}${numeroNuevo}`;
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
    case "varias_en_jurisdiccion":
      return base + `REFEPS tiene más de una matrícula habilitada de ${jurisdiccion} para ese DNI y ninguna es la que declaró.`;
  }
}
