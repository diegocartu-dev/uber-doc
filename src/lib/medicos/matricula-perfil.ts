// Lo que Mi perfil le muestra al profesional sobre su matrícula (13/11/2026).
//
// Con la identidad validada la matrícula no se escribe: se ELIGE entre las que
// REFEPS le tiene habilitadas (CLAUDE.md «La matrícula la dice REFEPS»). Acá se
// arma la lista que se le ofrece, con lo último que REFEPS devolvió y quedó
// guardado en su ficha. Es solo lo que se MUESTRA: al elegir, el servidor vuelve
// a consultar la biometría y REFEPS en vivo (lib/medicos/cambiar-matricula-validada.ts)
// y solo acepta una matrícula habilitada, de su profesión, para su DNI verificado.
//
// Funciones puras: las usan la página (servidor), la ruta y la pantalla.

import { profesionDe } from "@/lib/refeps/profesion";
import { normalizarJurisdiccion } from "../jurisdicciones";
import {
  declaradaDesdeRefeps,
  esLaDeLaFicha,
  etiquetaMatricula,
  normalizarNumeroMatricula,
  otrasHabilitadas,
  type MatriculaDeRefeps,
} from "./matricula-refeps";
import type { MotivoSinCambio } from "./cambiar-matricula-validada";

export interface OpcionDeMatricula {
  /** Jurisdicción y número tal como los devolvió REFEPS: es lo que viaja al servidor. */
  tipo: string;
  numero: string;
  /** "MP 1234 (Salta)": cómo se la nombra en pantalla. */
  etiqueta: string;
}

export interface MatriculaEnPerfil {
  /** La que figura hoy en su perfil y en sus documentos. */
  etiqueta: string;
  /** Las otras que puede elegir. Vacío = no hay nada para cambiar. */
  otras: OpcionDeMatricula[];
}

/** Qué es, para esta ficha, la matrícula que llegó elegida desde la pantalla. */
export type Eleccion =
  | { es: "opcion"; opcion: OpcionDeMatricula }
  | { es: "la_suya" } // ya es la de su ficha (una pestaña vieja)
  | { es: "no_disponible" } // a esta ficha no se le ofrece ninguna
  | { es: "fuera_de_lista" };

export interface FichaParaPerfil {
  tipo_matricula: string | null;
  numero_matricula: string | null;
  provincia_matricula: string | null;
  identidad_validada: boolean | null;
  didit_status: string | null;
  refeps_data: unknown;
  es_cuenta_test: boolean | null;
  profesion: string | null;
}

/**
 * `null` = la identidad todavía no está validada: la pantalla sigue como antes
 * (la matrícula tipeada es una pista y el cruce de identidad decide).
 *
 * Con la identidad validada devuelve la matrícula de la ficha y las que puede
 * elegir. No se ofrece ninguna si no hay biometría aprobada (el servidor no
 * tendría con qué confirmar el DNI), si es una cuenta de prueba (no se consultan
 * contra REFEPS) o en la instancia institucional (ahí la ficha la lleva la
 * institución).
 */
export function matriculaEnPerfil(
  ficha: FichaParaPerfil | null | undefined,
  institucional: boolean
): MatriculaEnPerfil | null {
  if (!ficha || ficha.identidad_validada !== true) return null;
  const puedeElegir = !institucional && ficha.es_cuenta_test !== true && ficha.didit_status === "Approved";
  const guardado = ficha.refeps_data as { matriculas?: unknown } | null;
  const deRefeps = Array.isArray(guardado?.matriculas) ? (guardado.matriculas as MatriculaDeRefeps[]) : [];
  const otras: OpcionDeMatricula[] = [];
  if (puedeElegir) {
    for (const m of otrasHabilitadas(ficha, deRefeps, profesionDe(ficha.profesion))) {
      const enFicha = declaradaDesdeRefeps(m);
      if (!enFicha || !m.tipo || !m.numero) continue;
      otras.push({ tipo: String(m.tipo), numero: String(m.numero), etiqueta: etiquetaMatricula(enFicha) });
    }
  }
  return { etiqueta: etiquetaMatricula(ficha), otras };
}

/**
 * Ubica lo que eligió entre lo que se le ofrece. Compara jurisdicción y número
 * normalizados, igual que la puerta: lo guardado de REFEPS va tal cual llegó.
 * No consulta a nadie: lo que no es una de sus opciones se rechaza acá.
 */
export function ubicarEleccion(
  ficha: FichaParaPerfil | null | undefined,
  institucional: boolean,
  elegida: { tipo: string; numero: string }
): Eleccion {
  const enPerfil = matriculaEnPerfil(ficha, institucional);
  if (!ficha || !enPerfil) return { es: "no_disponible" };
  const jurisdiccion = normalizarJurisdiccion(elegida.tipo);
  const numero = normalizarNumeroMatricula(elegida.numero);
  if (!jurisdiccion || !numero) return { es: "fuera_de_lista" };
  const opcion = enPerfil.otras.find(
    (o) => normalizarJurisdiccion(o.tipo) === jurisdiccion && normalizarNumeroMatricula(o.numero) === numero
  );
  if (opcion) return { es: "opcion", opcion };
  if (esLaDeLaFicha(ficha, { tipo: elegida.tipo, numero: elegida.numero, habilitada: true })) return { es: "la_suya" };
  const puedeElegir = !institucional && ficha.es_cuenta_test !== true && ficha.didit_status === "Approved";
  return puedeElegir ? { es: "fuera_de_lista" } : { es: "no_disponible" };
}

/**
 * El porqué de un cambio que no se hizo, dicho al profesional. Los textos de la
 * puerta están escritos para el equipo; estos no afirman nada que no se sepa:
 * cuando no se pudo confirmar qué quedó guardado, se le pide que mire.
 */
export function mensajeParaProfesional(codigo: MotivoSinCambio): string {
  switch (codigo) {
    case "transitorio":
      return "No pudimos confirmar tus datos en este momento. No se cambió nada: probá de nuevo en un rato.";
    case "no_habilitada":
      return "REFEPS hoy no tiene esa matrícula habilitada a tu nombre. No se cambió nada.";
    case "ya_es":
      return "Esa ya es tu matrícula.";
    case "cambio_mientras":
      return "Tus datos cambiaron mientras tanto. Recargá la página y probá de nuevo.";
    case "duplicada":
      return "Esa matrícula ya figura en otra cuenta de Docto. No se cambió nada. Escribinos a soporte@docto.com.ar.";
    case "refeps":
      return "REFEPS no confirmó tu registro en este momento. No se cambió nada. Escribinos a soporte@docto.com.ar.";
    case "identidad":
      return "No pudimos confirmar tu identidad para hacer el cambio. No se cambió nada. Escribinos a soporte@docto.com.ar.";
    case "no_disponible":
      return "Este cambio no está disponible para tu cuenta. Escribinos a soporte@docto.com.ar.";
    case "error":
      return "No pudimos guardar el cambio. Recargá la página y mirá qué matrícula figura; si es la de antes, probá de nuevo.";
  }
}
