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

// Psicología: el texto exacto con el que REFEPS la devuelve NO está verificado
// (13/10/2026; se confirma con el primer psicólogo real). Lista CERRADA, como la
// de médico: un texto con "psicolog" que no esté acá ("Técnico en psicología",
// "Psicólogo social", un título de especialista) no es la matrícula de un
// psicólogo, y la ficha va a revisión con el texto crudo a la vista. Si el texto
// real de REFEPS es otro, se suma acá.
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
