// ¿Esta matrícula de REFEPS es de MÉDICO?
//
// REFEPS devuelve bajo un mismo DNI las matrículas de TODAS las profesiones de la
// persona (en producción aparecen, además de "Médico", otras como técnicos). Cada
// matrícula lleva la profesión de su propia qualification (lib/refeps/validar.ts).
//
// Una matrícula de otra profesión no puede quedar como la del profesional en Docto
// (saldría en sus recetas), ni habilitarlo a atender en una jurisdicción. Sin dato
// de profesión no se adivina: cada lugar que llama decide qué hacer con "no sé".

const PROFESIONES_MEDICAS = new Set(["medico", "medica", "medico/a", "medico cirujano", "medica cirujana"]);

function normalizar(p: string | null | undefined): string {
  return (p ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** `true` solo si la profesión informada es la de médico. Sin dato → `false`. */
export function esMatriculaDeMedico(m: { profesion?: string | null }): boolean {
  return PROFESIONES_MEDICAS.has(normalizar(m.profesion));
}

/** `true` si REFEPS informó una profesión y NO es la de médico. Sin dato → `false`. */
export function esDeOtraProfesion(m: { profesion?: string | null }): boolean {
  return normalizar(m.profesion) !== "" && !esMatriculaDeMedico(m);
}
