// Paginación real contra PostgREST. Supabase corta en 1000 filas SIN avisar
// (regla 11 del manual): un `.limit(5000)` es un placebo.
//
// Se pagina por CURSOR sobre `id` (keyset), no por offset: con offset, una
// inserción concurrente entre dos páginas duplica una fila y omite otra
// (hallazgo de Roberto, 04/09). Con cursor, cada página arranca después del
// último `id` visto y ninguna fila se cuenta dos veces.
//
// Se pide `count: "exact"` en la primera página y se compara al final. Una
// diferencia chica es una inserción concurrente legítima y se registra; una
// grande es una lectura rota y se lanza en vez de mostrar un tablero que
// suma de menos.

export const PAGINA = 1000;
const TOLERANCIA = 3;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>;

/**
 * Trae todas las filas de una consulta paginándola por cursor.
 * `pagina(cursor)` recibe el último `id` traído (o `null` en la primera
 * página) y debe devolver la consulta con `.gt("id", cursor)` cuando el
 * cursor no es null, ordenada por `id` y limitada a `PAGINA`, con
 * `{ count: "exact" }` en el select.
 */
export async function traerTodo<T extends { id?: unknown }>(nombre: string, pagina: (cursor: string | null) => Pagina<T>): Promise<T[]> {
  const todo: T[] = [];
  let total: number | null = null;
  let cursor: string | null = null;
  for (;;) {
    const { data, error, count } = await pagina(cursor);
    if (error) throw new Error(`Tablero: no se pudo leer ${nombre}: ${error.message}`);
    if (typeof count === "number" && total == null) total = count;
    const filas = data ?? [];
    todo.push(...filas);
    if (filas.length < PAGINA) break;
    cursor = String(filas[filas.length - 1].id);
  }
  if (total != null && total !== todo.length) {
    if (Math.abs(total - todo.length) > TOLERANCIA) {
      throw new Error(`Tablero: ${nombre} trajo ${todo.length} filas de ${total} — paginación incompleta`);
    }
    console.warn(`Tablero: ${nombre} trajo ${todo.length} filas de ${total} (inserciones concurrentes durante la lectura)`);
  }
  return todo;
}
