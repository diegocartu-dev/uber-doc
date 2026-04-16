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
  if (!texto) return texto;
  return texto
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((palabra) => {
      if (palabra === "dr." || palabra === "dra.") {
        return palabra.charAt(0).toUpperCase() + palabra.slice(1);
      }
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(" ");
}
