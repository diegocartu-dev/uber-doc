// ¿Esta matrícula de REFEPS es de la profesión del profesional?
//
// REFEPS devuelve bajo un mismo DNI las matrículas de TODAS las profesiones de la
// persona (en producción aparecen, además de "Médico", otras como técnicos). Cada
// matrícula lleva la profesión de su propia qualification (lib/refeps/validar.ts).
//
// Una matrícula de otra profesión no puede quedar como la del profesional en Docto
// (saldría en sus documentos), ni habilitarlo a atender en una jurisdicción. Sin dato
// de profesión no se adivina: cada lugar que llama decide qué hacer con "no sé".
//
// Desde el 13/10/2026 la ficha dice su profesión (`medicos.profesion`): médico o
// psicólogo (docs/sprints/2026-10-13-psicologos.md). Toda ficha anterior es médico.

export type Profesion = "medico" | "psicologo";

/** La columna `medicos.profesion` como valor seguro: lo que no sea psicólogo es médico. */
export function profesionDe(valor: string | null | undefined): Profesion {
  return valor === "psicologo" ? "psicologo" : "medico";
}

/** "médico" / "psicólogo", para los textos del panel. */
export function nombreProfesion(p: Profesion): string {
  return p === "psicologo" ? "psicólogo" : "médico";
}

const PROFESIONES_MEDICAS = new Set(["medico", "medica", "medico/a", "medico cirujano", "medica cirujana"]);

function normalizar(p: string | null | undefined): string {
  return (p ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Psicología. VERIFICADO el 13/10/2026 contra el catálogo público de REFEPS
// (SISA → Codificaciones públicas → REFEPS → "Profesiones matriculadas"): las
// únicas dos profesiones de psicología son el código 5 "Psicólogo" y el código 6
// "Licenciado en psicología", las dos con profesión de referencia "Psicólogo".
// Todo lo demás que contiene "psic" es OTRA profesión y no entra: Psicopedagogo,
// Licenciado en psicopedagogía, Psicomotricista, Técnico en psicomotricidad,
// Técnico psicogerontología, Profesor en psicomotricidad, Técnico en
// psicopedagogía. Lista CERRADA, como la de médico: un texto que no esté acá
// manda la ficha a revisión con el texto crudo a la vista. Las variantes en
// femenino y abreviadas quedan por si el Bus las devuelve así.
const PROFESIONES_PSICOLOGIA = new Set([
  "psicologo",
  "psicologa",
  "psicologo/a",
  "psicologia",
  "licenciado en psicologia",
  "licenciada en psicologia",
  "licenciado/a en psicologia",
  "lic. en psicologia",
  "lic en psicologia",
]);
function esTextoDePsicologia(n: string): boolean {
  return PROFESIONES_PSICOLOGIA.has(n);
}

/** `true` solo si la profesión informada es `profesion`. Sin dato → `false`. */
export function esMatriculaDe(profesion: Profesion, m: { profesion?: string | null }): boolean {
  const n = normalizar(m.profesion);
  return profesion === "psicologo" ? esTextoDePsicologia(n) : PROFESIONES_MEDICAS.has(n);
}

/** `true` solo si la profesión informada es la de médico. Sin dato → `false`. */
export function esMatriculaDeMedico(m: { profesion?: string | null }): boolean {
  return esMatriculaDe("medico", m);
}

/** `true` si REFEPS informó una profesión y NO es `profesion`. Sin dato → `false`. */
export function esDeOtraProfesion(m: { profesion?: string | null }, profesion: Profesion = "medico"): boolean {
  return normalizar(m.profesion) !== "" && !esMatriculaDe(profesion, m);
}
