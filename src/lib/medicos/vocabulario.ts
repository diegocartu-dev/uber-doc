// Cómo se nombra al profesional según su profesión (13/10/2026, psicólogos F4).
//
// Para los médicos NADA cambia: cada helper devuelve lo que la pantalla decía
// hasta hoy cuando la profesión es médico (o no se sabe). Solo un psicólogo, o
// el paciente de un psicólogo, ve la otra palabra. Es puro: sirve en el cliente.

import { profesionDe, type Profesion } from "@/lib/refeps/profesion";

export { profesionDe, type Profesion };

export function esPsicologia(profesion: string | null | undefined): boolean {
  return profesionDe(profesion) === "psicologo";
}

/** Etiqueta de una fila/tarjeta: "Médico" para médicos, "Profesional" para psicología. */
export function etiquetaProfesional(profesion: string | null | undefined): "Médico" | "Profesional" {
  return esPsicologia(profesion) ? "Profesional" : "Médico";
}

/** "tu médico" / "tu profesional", en minúscula, para el medio de una frase. */
export function tuProfesional(profesion: string | null | undefined): "tu médico" | "tu profesional" {
  return esPsicologia(profesion) ? "tu profesional" : "tu médico";
}

/** Qué recibe el paciente al terminar: "recetas y documentos" / "constancia de atención". */
export function nombreDocumentos(profesion: string | null | undefined): "recetas y documentos" | "constancia de atención" {
  return esPsicologia(profesion) ? "constancia de atención" : "recetas y documentos";
}

/** "consulta" para médicos, "sesión" para psicología (solo donde el texto habla de la atención en sí). */
export function nombreAtencion(profesion: string | null | undefined): "consulta" | "sesión" {
  return esPsicologia(profesion) ? "sesión" : "consulta";
}
