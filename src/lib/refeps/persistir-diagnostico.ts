// Un error de SISTEMA de REFEPS (el Bus no respondió) se guarda como diagnóstico,
// pero sin borrar lo que REFEPS ya había dicho. Antes, un timeout reemplazaba
// `refeps_data` entero por el error: la ficha se quedaba sin la lista de
// matrículas (y sin los botones para elegir una) hasta otra validación exitosa.

type Datos = Record<string, unknown>;

export function diagnosticoSinPisar(previo: unknown, intento: Datos, ahora: string): Datos {
  const anterior = (previo && typeof previo === "object" ? previo : null) as Datos | null;
  const teniaRespuesta = Array.isArray(anterior?.matriculas) && (anterior?.matriculas as unknown[]).length > 0;
  if (!teniaRespuesta) return intento;
  return { ...anterior, ultimo_error: intento.error ?? "REFEPS_ERROR", ultimo_error_at: ahora };
}
