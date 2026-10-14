// La receta estructurada (13/10/2026): la lista de medicamentos tal como la armó
// el profesional, con la cantidad de envases. Se guarda en
// `documentos.medicamentos` para registrar la receta en el repositorio de
// Farmalink (docs/farmalink-integracion.md). El texto de la receta, el PDF y la
// firma siguen saliendo de `documentos.contenido`, como siempre.
//
// Esto valida lo que llega del navegador: nada se guarda tal cual viene.

export const MAX_MEDICAMENTOS = 30;
/** Farmalink acepta hasta 2 dígitos de envases por ítem. */
export const MAX_ENVASES = 99;

export type MedicamentoGuardado = {
  nombre: string;
  droga: string;
  presentacion: string;
  forma_farmaceutica: string;
  via: string;
  cantidad: number;
};

const LIMITES: Record<Exclude<keyof MedicamentoGuardado, "cantidad">, number> = {
  nombre: 200,
  droga: 200,
  presentacion: 300,
  forma_farmaceutica: 120,
  via: 120,
};

/** Cantidad de envases: entero entre 1 y 99; si no viene o no es válida, 1. */
export function cantidadDeEnvases(valor: unknown): number {
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor) : NaN;
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, MAX_ENVASES);
}

export function normalizarMedicamentos(
  entrada: unknown,
): { ok: true; medicamentos: MedicamentoGuardado[] } | { ok: false; error: string } {
  if (!Array.isArray(entrada)) return { ok: false, error: "medicamentos no es una lista" };
  if (entrada.length === 0) return { ok: false, error: "lista vacía" };
  if (entrada.length > MAX_MEDICAMENTOS) return { ok: false, error: "demasiados medicamentos" };

  const medicamentos: MedicamentoGuardado[] = [];
  for (const crudo of entrada) {
    if (!crudo || typeof crudo !== "object") return { ok: false, error: "ítem inválido" };
    const m = crudo as Record<string, unknown>;
    const texto = (k: keyof typeof LIMITES) => (typeof m[k] === "string" ? (m[k] as string).trim().slice(0, LIMITES[k]) : "");
    const item: MedicamentoGuardado = {
      nombre: texto("nombre"),
      droga: texto("droga"),
      presentacion: texto("presentacion"),
      forma_farmaceutica: texto("forma_farmaceutica"),
      via: texto("via"),
      cantidad: cantidadDeEnvases(m.cantidad),
    };
    // Igual que la serialización a texto: un ítem sin nombre no entra a la receta.
    if (!item.nombre) continue;
    medicamentos.push(item);
  }
  if (medicamentos.length === 0) return { ok: false, error: "ningún medicamento con nombre" };
  return { ok: true, medicamentos };
}
