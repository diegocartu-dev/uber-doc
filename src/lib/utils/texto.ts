/**
 * Capitaliza cada palabra de un nombre propio.
 * Respeta prefijos médicos: "Dr." y "Dra." quedan como están.
 * Ejemplos:
 *   "juan pérez"       → "Juan Pérez"
 *   "dr. carlos lópez" → "Dr. Carlos López"
 *   "MARÍA ELENA"      → "María Elena"
 *   "dra. ANA García"  → "Dra. Ana García"
 */
export function capitalizarNombre(texto: string): string {
  if (!texto) return "";
  return texto
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(" ");
}

/**
 * Formatea nombre de médico con título, evitando duplicación.
 * Si el nombre ya empieza con "Dr." o "Dra.", no agrega el título.
 * Ejemplos:
 *   formatNombreMedico("Carlos López")              → "Dr. Carlos López"
 *   formatNombreMedico("Dr. Carlos López")           → "Dr. Carlos López"
 *   formatNombreMedico("Carlos López", "Dra.")       → "Dra. Carlos López"
 *   formatNombreMedico("Dra. Ana García", "Dra.")    → "Dra. Ana García"
 *   formatNombreMedico("Dr. Docto Test")             → "Dr. Docto Test"
 */
export function formatNombreMedico(nombre: string, titulo?: string): string {
  if (!nombre) return "";
  const trimmed = nombre.trim();
  if (/^Dra?\.\s/i.test(trimmed)) return capitalizarNombre(trimmed);
  if (/^Dra?\./i.test(trimmed)) return capitalizarNombre(trimmed.replace(/^(Dra?\.)/i, "$1 "));
  const prefix = titulo?.trim() || "Dr.";
  return `${prefix} ${capitalizarNombre(trimmed)}`;
}
