// src/lib/metering/db.ts
// CÓMO SE LEE LA BASE CUANDO EL NÚMERO ES CONTRACTUAL.
//
// ── EL HALLAZGO QUE ESTE ARCHIVO EXISTE PARA NO REPETIR ──────────────────────
// PostgREST corta en `max-rows` (1000 por defecto en Supabase) y NO devuelve
// error al truncar: manda menos filas con status 200. Ya pasó una vez en esta
// misma unidad de negocio — el conteo semanal que sostiene el acuerdo de horas
// se truncaba en silencio a escala de piloto (revisión Etapa 2, documentado en
// `src/lib/otorgador/oferta.ts`). Un mes truncado no se ve truncado: se ve como
// un mes tranquilo, y el CSV cierra contra el panel porque los dos salen mal
// juntos.
//
// La segunda mitad del mismo problema: `.in()` con muchos UUIDs arma una URL de
// kilobytes. 500 ids ≈ 19 KB, muy por encima de lo que aguanta el request line
// de un gateway. El pedido no vuelve truncado: vuelve fallado — y si nadie mira
// el `error`, vuelve VACÍO, que es peor todavía.
//
// Por eso toda lectura del metering pasa por acá y toda lectura del metering
// TIRA ante un error. Un cero silencioso en la factura no es un cero: es una
// pregunta sin responder disfrazada de respuesta.

/** Forma mínima de una respuesta de PostgREST (no se importa el tipo de supabase-js). */
type Respuesta<T> = { data: T[] | null; error: { message: string } | null };
type RespuestaConteo = { count: number | null; error: { message: string } | null };

/** Tamaño de página. Igual al `max-rows` por defecto de Supabase. */
export const PAGINA_DB = 1000;

/**
 * Ids por lote en un `.in()`. 100 UUIDs ≈ 3,7 KB de URL: entra cómodo en
 * cualquier gateway y sigue siendo una sola ida y vuelta cada 100 encuentros.
 */
export const LOTE_IN = 100;

/** Parte una lista en lotes de `LOTE_IN`. */
export function enLotes<T>(ids: T[], tamano = LOTE_IN): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < ids.length; i += tamano) lotes.push(ids.slice(i, i + tamano));
  return lotes;
}

/**
 * Lee TODAS las filas de una query, paginando con `.range()` hasta agotar.
 *
 * `pedir` recibe el rango y devuelve la query armada. La query DEBE tener un
 * `.order()` estable (con un desempate único, típicamente `id`): sin orden
 * total, paginar por rango duplica filas y saltea otras.
 *
 * Tira ante cualquier error — es deliberado. El caller que quiera degradar en
 * vez de fallar tiene que decirlo explícitamente con un try/catch a la vista.
 */
export async function leerTodo<T>(
  descripcion: string,
  pedir: (desde: number, hasta: number) => PromiseLike<Respuesta<T>>
): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += PAGINA_DB) {
    const { data, error } = await pedir(off, off + PAGINA_DB - 1);
    if (error) throw new Error(`${descripcion}: ${error.message}`);
    const filas = data ?? [];
    out.push(...filas);
    if (filas.length < PAGINA_DB) break;
  }
  return out;
}

/**
 * Igual que `leerTodo`, pero para una query filtrada por una lista de ids:
 * parte la lista en lotes (URL corta) y pagina adentro de cada lote (un solo
 * encuentro puede dejar decenas de filas de presencia).
 */
export async function leerTodoEnLotes<T>(
  descripcion: string,
  ids: string[],
  pedir: (lote: string[], desde: number, hasta: number) => PromiseLike<Respuesta<T>>
): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  for (const lote of enLotes(ids)) {
    const filas = await leerTodo(descripcion, (desde, hasta) => pedir(lote, desde, hasta));
    out.push(...filas);
  }
  return out;
}

/**
 * Conteo EXACTO (`count: 'exact', head: true`): el servidor cuenta y no manda
 * ni una fila. Es la única forma de contar que no depende del tope de filas —
 * `filas.length` sobre un select sin paginar es un conteo que miente hacia
 * abajo justo cuando el volumen empieza a importar.
 */
export async function contarExacto(
  descripcion: string,
  pedir: () => PromiseLike<RespuestaConteo>
): Promise<number> {
  const { count, error } = await pedir();
  if (error) throw new Error(`${descripcion}: ${error.message}`);
  return count ?? 0;
}
