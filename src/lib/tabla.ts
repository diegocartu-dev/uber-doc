// VISTA DE TABLA — la lógica pura del buscador, el orden y el filtro por columna.
//
// PORTADO DESDE OVERCALL, sin cambios de comportamiento (gestion/lib/tabla.ts). El mandato
// de tablas es regla de la casa para todos los proyectos, y la implementación de referencia
// ya existe probada: copiarla evita que cada producto invente su propia versión con sus
// propios bugs. Si algo se corrige acá, se corrige allá — y al revés.
//
// Pedido de Diego (2026-09-07/08): "todas las tablas deben tener su buscador y su filtro u
// ordenador tipo Excel" · "el orden siempre es de más nuevo a más viejo en TODO".
//
// Acá NO hay React ni DOM: se prueba con `node scripts/test-unit.mjs`.
// La UI vive en src/components/tabla/TablaDatos.tsx.

const DIACRITICOS = /[̀-ͯ]/g;

/** Texto comparable: minúsculas y sin acentos. Misma receta que lib/nombres.ts — normalizar
 *  a NFD ANTES de sacar diacríticos, si no "Atención" pierde la letra (bug del 2026-08-07). */
export function textoBuscable(v: unknown): string {
  return String(v ?? "").toLowerCase().normalize("NFD").replace(DIACRITICOS, "");
}

export type TipoColumna = "texto" | "numero" | "fecha";

export type Columna<T> = {
  /** clave estable: identifica la columna en la URL y en el estado de orden */
  k: string;
  /** lo que se lee en la cabecera, en castellano */
  t: string;
  /** el valor CRUDO de la celda: lo que se busca, se ordena y se filtra */
  val: (f: T) => string | number | null | undefined;
  tipo?: TipoColumna;
  /** alineada a la derecha (cifras) */
  num?: boolean;
  /** no se puede ordenar (columna de acciones) */
  sinOrden?: boolean;
  /** SIN EMBUDO. Solo para datos que GENERA cada llamada y crecen sin techo:
   *  #ref, número del llamante, fecha y hora, duración. Todo lo que crea alguien en el
   *  panel (actividad, DDE, habilidad, operador, troncal, estado) es un catálogo finito y
   *  lleva embudo — el default es llevarlo, así una columna nueva nunca queda sin filtro
   *  por descuido. Criterio corregido por Diego el 2026-09-08. */
  porEvento?: boolean;
  /** no participa del buscador de texto (p. ej. una columna de solo íconos) */
  sinBuscar?: boolean;
  /** ORDEN POR CICLO DE VIDA, no alfabético. Un estado no se ordena por su inicial:
   *  "Conversando, Timbrando, Disponible, En pausa, Desconectado" es el orden que tiene
   *  sentido para quien mira. Lo que no esté en la lista va al final, alfabético. */
  rango?: string[];
};

export type Orden = { k: string; dir: "asc" | "desc" } | null;
/** por columna, el conjunto de valores DESTILDADOS (excluidos). Vacío = sin filtro. */
export type Filtros = Record<string, string[]>;

export type Vista = { texto: string; orden: Orden; filtros: Filtros };
export const VISTA_VACIA: Vista = { texto: "", orden: null, filtros: {} };

/** Orden alfabético como lo espera una persona: "Base 2" antes que "Base 10", la ñ en su
 *  lugar, sin distinguir mayúsculas ni acentos. */
export function compararTexto(a: unknown, b: unknown): number {
  return String(a ?? "").localeCompare(String(b ?? ""), "es", { sensitivity: "base", numeric: true });
}

/** ¿la celda está vacía? OJO: Number(null) y Number("") dan 0, así que sin este chequeo una
 *  celda sin dato se ordenaba como un cero — un operador sin llamadas aparecía arriba de todo
 *  como si fuera el que menos atendió. Cazado por tabla.test.ts. */
function esVacio<T>(c: Columna<T>, f: T): boolean {
  const v = c.val(f);
  if (v === null || v === undefined || v === "") return true;
  if (c.tipo === "numero" || c.num) return !Number.isFinite(Number(v));
  if (c.tipo === "fecha") return Number.isNaN(Date.parse(String(v)));
  return false;
}

function comparar<T>(c: Columna<T>, a: T, b: T): number {
  const va = c.val(a), vb = c.val(b);
  if (c.rango) {
    const ia = c.rango.indexOf(String(va)), ib = c.rango.indexOf(String(vb));
    const pa = ia < 0 ? c.rango.length : ia, pb = ib < 0 ? c.rango.length : ib;
    return pa - pb || compararTexto(va, vb);
  }
  if (c.tipo === "numero" || c.num) return Number(va) - Number(vb);
  if (c.tipo === "fecha") return Date.parse(String(va)) - Date.parse(String(vb));
  return compararTexto(va, vb);
}

/** ¿esta columna lleva embudo? Todas menos las de acciones y las que genera cada llamada. */
export function llevaFiltro<T>(c: Columna<T>): boolean {
  return !c.porEvento && !c.sinOrden;
}

/** Los valores distintos de una columna, con cuántas filas tiene cada uno.
 *  Se calculan SIEMPRE sobre el universo sin el filtro de esa misma columna: si no, al
 *  destildar un valor desaparecería de su propia lista y no se podría volver a tildar. */
export function valoresDe<T>(filas: T[], cols: Columna<T>[], c: Columna<T>, v: Vista): { valor: string; n: number }[] {
  const otros: Vista = { ...v, filtros: { ...v.filtros, [c.k]: [] } };
  const base = filtrar(filas, cols, otros);
  const cuenta = new Map<string, number>();
  for (const f of base) {
    const s = String(c.val(f) ?? "");
    cuenta.set(s, (cuenta.get(s) || 0) + 1);
  }
  // en una columna con ciclo de vida los valores del embudo se listan en ESE orden, y los
  // del ciclo aparecen aunque cuenten 0 (si no, un estado sin nadie hoy desaparece del filtro)
  if (c.rango) for (const v of c.rango) if (!cuenta.has(v)) cuenta.set(v, 0);
  const lista = [...cuenta.entries()].map(([valor, n]) => ({ valor, n }));
  if (c.rango) {
    const pos = (v: string) => { const i = c.rango!.indexOf(v); return i < 0 ? c.rango!.length : i; };
    return lista.sort((a, b) => pos(a.valor) - pos(b.valor) || compararTexto(a.valor, b.valor));
  }
  return lista.sort((a, b) => compararTexto(a.valor, b.valor));
}

/** ¿la fila pasa el buscador de texto? Tokens separados por espacio en AND: "cob salta"
 *  trae las filas que contienen las dos cosas. */
export function coincide<T>(f: T, cols: Columna<T>[], texto: string): boolean {
  const q = textoBuscable(texto).trim();
  if (!q) return true;
  const heno = textoBuscable(cols.filter((c) => !c.sinBuscar && !c.sinOrden).map((c) => c.val(f) ?? "").join(" "));
  return q.split(/\s+/).every((t) => heno.includes(t));
}

export function filtrar<T>(filas: T[], cols: Columna<T>[], v: Vista): T[] {
  const activos = Object.entries(v.filtros).filter(([, ex]) => ex && ex.length);
  return filas.filter((f) => {
    for (const [k, ex] of activos) {
      const c = cols.find((x) => x.k === k);
      if (c && ex.includes(String(c.val(f) ?? ""))) return false;
    }
    return coincide(f, cols, v.texto);
  });
}

/** Ordena. `defecto` es el orden natural de la pantalla — en casi todas, lo más nuevo
 *  arriba (regla de Diego 2026-09-07). `clave` desempata SIEMPRE: sin eso, en una tabla que
 *  se refresca sola las filas empatadas se intercambian en cada tick y la lista tiembla. */
export function ordenar<T>(filas: T[], cols: Columna<T>[], orden: Orden, defecto: (a: T, b: T) => number, clave: (f: T) => string): T[] {
  const base = [...filas].sort((a, b) => defecto(a, b) || compararTexto(clave(a), clave(b)));
  if (!orden) return base;
  const c = cols.find((x) => x.k === orden.k);
  if (!c || c.sinOrden) return base;
  const signo = orden.dir === "asc" ? 1 : -1;
  return base.sort((a, b) => {
    // los vacíos van SIEMPRE al final, ordene como ordene: al invertir, un "—" no puede
    // saltar al primer lugar (cazado por tabla.test.ts)
    const ea = esVacio(c, a), eb = esVacio(c, b);
    if (ea !== eb) return ea ? 1 : -1;
    if (ea && eb) return compararTexto(clave(a), clave(b));
    return signo * comparar(c, a, b) || compararTexto(clave(a), clave(b));
  });
}

/** Los tres estados del clic en la cabecera: ascendente → descendente → orden por defecto. */
export function siguienteOrden(orden: Orden, k: string): Orden {
  if (!orden || orden.k !== k) return { k, dir: "asc" };
  return orden.dir === "asc" ? { k, dir: "desc" } : null;
}

/** El orden por defecto de casi toda la app: lo más nuevo arriba (regla de Diego 2026-09-07).
 *  Usa la fecha si existe; si no, el id, que en un serial crece con cada alta. */
export function masNuevoPrimero<T extends Record<string, unknown>>(campo = "created_at", id = "id") {
  return (a: T, b: T): number => {
    const fa = Date.parse(String(a?.[campo] ?? "")), fb = Date.parse(String(b?.[campo] ?? ""));
    if (!Number.isNaN(fa) && !Number.isNaN(fb) && fa !== fb) return fb - fa;
    const na = Number(a?.[id]), nb = Number(b?.[id]);
    if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
    return 0;
  };
}

export function hayVista(v: Vista): boolean {
  return !!v.texto || !!v.orden || Object.values(v.filtros).some((ex) => ex && ex.length);
}

// ── la vista viaja en la URL: se comparte por link y sobrevive a un F5 ──────────────
export function vistaAUrl(v: Vista): string {
  const p = new URLSearchParams();
  if (v.texto) p.set("buscar", v.texto);
  if (v.orden) p.set("orden", `${v.orden.k},${v.orden.dir}`);
  for (const [k, ex] of Object.entries(v.filtros)) if (ex && ex.length) p.set(`sin_${k}`, ex.join("~"));
  return p.toString();
}

export function urlAVista(busqueda: string): Vista {
  const p = new URLSearchParams(busqueda);
  const v: Vista = { texto: p.get("buscar") || "", orden: null, filtros: {} };
  const o = p.get("orden");
  if (o) {
    const [k, dir] = o.split(",");
    if (k) v.orden = { k, dir: dir === "desc" ? "desc" : "asc" };
  }
  p.forEach((val, k) => { if (k.startsWith("sin_") && val) v.filtros[k.slice(4)] = val.split("~"); });
  return v;
}
