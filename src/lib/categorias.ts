// Nombre visible de cada categoría del profesional (Diego, 14/10/2026).
//
// Las categorías se nombran como niveles ("metales"); hoy el más alto es Fundador.
// Lo guardado en `medicos.categoria` no cambia ('founder' / 'tradicional'): el
// nombre se pone al mostrar. Archivo sin dependencias del servidor a propósito:
// lo usan pantallas cliente y servidor.

export function nombreCategoria(categoria: string | null | undefined): string {
  if (categoria === "founder") return "Fundador";
  if (categoria === "tradicional") return "Oro";
  return "—";
}
