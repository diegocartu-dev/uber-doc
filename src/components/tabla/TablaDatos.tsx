"use client";
// VISTA DE TABLA — la UI del buscador, el orden por cabecera y el filtro por columna.
//
// PORTADO DESDE OVERCALL (gestion/app/tabla-datos.tsx). El COMPORTAMIENTO es idéntico:
// lo único que cambia son las clases, que allá son CSS propio y acá utilidades con los
// tokens de Docto (azul #378ADD interactivo, verde solo para estado).
// La lógica pura y sus pruebas viven en src/lib/tabla.ts.
//
// Cómo se usa una pantalla (esto es TODO lo que hay que escribir):
//   const COLS: Columna<Op>[] = [
//     { k: "sip", t: "Puesto", val: (o) => o.sip_user, num: true },
//     { k: "nombre", t: "Nombre", val: (o) => o.nombre },
//     { k: "alta", t: "Alta", val: (o) => o.created_at, tipo: "fecha", porEvento: true },
//     { k: "acc", t: "Acciones", val: () => "", sinOrden: true, num: true },
//   ];
//   const v = useVistaTabla(ops, COLS, { clave: (o) => o.sip_user, defecto: masNuevoPrimero });
//   <BarraTabla vista={v} placeholder="Buscar operador…" />
//   <table className="tabla"><CabezaTabla vista={v} /><tbody>{v.filas.map(fila)}</tbody></table>
//
// El orden por DEFECTO de casi todas las pantallas es lo más nuevo arriba (regla de Diego:
// "el orden siempre es de más nuevo a más viejo en TODO"). La excepción escrita es el
// monitor, que ordena por puesto: el supervisor busca a alguien en un lugar fijo.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { filtrar, hayVista, llevaFiltro, ordenar, siguienteOrden, urlAVista,
         valoresDe, vistaAUrl, VISTA_VACIA, type Columna, type Orden, type Vista } from "@/lib/tabla";

export type { Columna } from "@/lib/tabla";
export { compararTexto } from "@/lib/tabla";

export type VistaTabla<T> = {
  filas: T[];            // ya filtradas y ordenadas: es lo que la pantalla pinta
  total: number;         // cuántas había antes de filtrar
  cols: Columna<T>[];
  vista: Vista;
  orden: Orden;
  hay: boolean;          // ¿hay algún filtro puesto? (para "Limpiar filtros")
  todas: T[];
  alternarOrden: (k: string) => void;
  alternarValor: (k: string, valor: string) => void;
  verTodos: (k: string) => void;
  verNinguno: (k: string) => void;
  setTexto: (s: string) => void;
  limpiar: () => void;
  valores: (c: Columna<T>) => { valor: string; n: number }[];
};

/** El hook: recibe las filas y las columnas, devuelve las filas ya filtradas y ordenadas. */
export function useVistaTabla<T>(
  filas: T[],
  cols: Columna<T>[],
  opciones: { clave: (f: T) => string; defecto?: (a: T, b: T) => number; urlOff?: boolean }
): VistaTabla<T> {
  const { clave, defecto, urlOff } = opciones;
  const [vista, setVista] = useState<Vista>(VISTA_VACIA);

  // la vista se lee de la URL UNA vez, después de hidratar (en el servidor no hay window;
  // leerla en el useState inicial rompería la hidratación)
  useEffect(() => {
    if (urlOff) return;
    const v = urlAVista(window.location.search);
    if (hayVista(v)) setVista(v);
  }, [urlOff]);

  // y se escribe con replaceState: no navega, no re-renderiza Next, y la flecha "atrás"
  // del navegador no deshace un filtro (que sería desconcertante)
  useEffect(() => {
    if (urlOff) return;
    const qs = vistaAUrl(vista);
    const otros = new URLSearchParams(window.location.search);
    [...otros.keys()].forEach((k) => { if (k === "buscar" || k === "orden" || k.startsWith("sin_")) otros.delete(k); });
    const resto = otros.toString();
    const final = [resto, qs].filter(Boolean).join("&");
    window.history.replaceState(null, "", window.location.pathname + (final ? "?" + final : ""));
  }, [vista, urlOff]);

  const porDefecto = defecto || (() => 0);
  const visibles = useMemo(
    () => ordenar(filtrar(filas, cols, vista), cols, vista.orden, porDefecto, clave),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, cols, vista]
  );

  const alternarOrden = useCallback((k: string) => setVista((v) => ({ ...v, orden: siguienteOrden(v.orden, k) })), []);
  const alternarValor = useCallback((k: string, valor: string) => setVista((v) => {
    const ex = new Set(v.filtros[k] || []);
    if (ex.has(valor)) ex.delete(valor); else ex.add(valor);
    return { ...v, filtros: { ...v.filtros, [k]: [...ex] } };
  }), []);
  const verTodos = useCallback((k: string) => setVista((v) => ({ ...v, filtros: { ...v.filtros, [k]: [] } })), []);
  // "Ninguno" destilda todo de una: con 50 habilidades, "ver solo una" costaba 49 clics
  const verNinguno = useCallback((k: string, valores: string[]) =>
    setVista((v) => ({ ...v, filtros: { ...v.filtros, [k]: valores } })), []);
  const setTexto = useCallback((texto: string) => setVista((v) => ({ ...v, texto })), []);
  const limpiar = useCallback(() => setVista(VISTA_VACIA), []);
  const valores = useCallback((c: Columna<T>) => valoresDe(filas, cols, c, vista), [filas, cols, vista]);

  return { filas: visibles, total: filas.length, cols, vista, orden: vista.orden, hay: hayVista(vista),
           todas: filas, alternarOrden, alternarValor, verTodos,
           verNinguno: (k: string) => verNinguno(k, valoresDe(filas, cols, cols.find((c) => c.k === k)!, { ...vista, filtros: { ...vista.filtros, [k]: [] } }).map((x) => x.valor)),
           setTexto, limpiar, valores };
}

/** La barra de arriba: buscador + lo que la pantalla quiera meter (chips) + Limpiar + cuenta. */
export function BarraTabla<T>({ vista, placeholder, children, cuenta, enHistoricos }: {
  vista: VistaTabla<T>; placeholder: string; children?: ReactNode; cuenta?: string; enHistoricos?: number;
}) {
  // un chip por columna filtrada: el filtro puesto se VE y se saca de un clic, en vez de
  // quedar escondido en un embudo que hay que ir a buscar
  const activos = vista.cols.filter((c) => (vista.vista.filtros[c.k] || []).length > 0);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div>
        <input type="search" className="w-[230px] rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#378ADD]" value={vista.vista.texto} placeholder={placeholder}
          aria-label={placeholder} onChange={(e) => vista.setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") vista.setTexto(""); }} />
      </div>
      {children}
      {activos.map((c) => (
        <button key={c.k} className="rounded-full border border-[#378ADD] bg-[#EBF3FC] px-2.5 py-1 text-[12px] font-medium text-[#2D75C4] hover:border-[#E24B4A] hover:bg-red-50 hover:text-[#E24B4A]" onClick={() => vista.verTodos(c.k)}
          title={`Sacar el filtro de ${c.t}`}>
          {c.t}: sin {(vista.vista.filtros[c.k] || []).length} <span aria-hidden="true">×</span>
        </button>
      ))}
      {vista.hay && <button className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-[#378ADD] hover:bg-[#EBF3FC]" onClick={vista.limpiar}>Limpiar filtros</button>}
      <span className="ml-auto text-[12px] text-gray-500" aria-live="polite">
        <strong>{vista.filas.length}</strong>{vista.filas.length !== vista.total ? <> de <strong>{vista.total}</strong></> : null} {cuenta || ""}
        {enHistoricos ? <> · <strong>{enHistoricos}</strong> en históricos</> : null}
      </span>
    </div>
  );
}

/** El <thead> completo: cada columna con su botón de orden y, si corresponde, su embudo. */
export function CabezaTabla<T>({ vista }: { vista: VistaTabla<T> }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <thead>
      <tr>
        {vista.cols.map((c) => {
          const ordenada = vista.orden?.k === c.k;
          return (
            <th key={c.k}
                className={"border-b border-gray-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 " + (c.num ? "text-right" : "text-left")}
                aria-sort={ordenada ? (vista.orden!.dir === "asc" ? "ascending" : "descending") : undefined}>
              <span className="inline-flex max-w-full items-center gap-px">
                {c.sinOrden ? <span className="px-1 py-0.5">{c.t}</span> : (
                  <button className="inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1 py-0.5 font-[inherit] text-[inherit] uppercase tracking-[inherit] hover:bg-[#EBF3FC] hover:text-gray-900" onClick={() => vista.alternarOrden(c.k)}
                    aria-label={`Ordenar por ${c.t}`}>
                    {c.t}
                    <span className={"inline-block w-2 text-[10px] " + (ordenada ? "text-[#378ADD] opacity-100" : "text-gray-400 opacity-45")} aria-hidden="true">
                      {ordenada ? (vista.orden!.dir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                )}
                {llevaFiltro(c) && <Embudo vista={vista} col={c} abierta={abierta} setAbierta={setAbierta} />}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

/** El "filtro tipo Excel": los valores que existen en esa columna, con su conteo, para tildar. */
function Embudo<T>({ vista, col, abierta, setAbierta }: {
  vista: VistaTabla<T>; col: Columna<T>; abierta: string | null; setAbierta: (k: string | null) => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [buscaValor, setBuscaValor] = useState("");
  const abierto = abierta === col.k;
  const excluidos = vista.vista.filtros[col.k] || [];
  const valores = useMemo(() => (abierto ? vista.valores(col) : []), [abierto, vista, col]);
  const muchos = valores.length > 8;
  const lista = useMemo(() => {
    if (!buscaValor) return valores;
    const limpio = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const q = limpio(buscaValor);
    return valores.filter((v) => limpio(v.valor).includes(q));
  }, [valores, buscaValor]);

  useEffect(() => {
    if (!abierto) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: Math.min(r.bottom + 6, window.innerHeight - 320), left: Math.min(Math.max(8, r.left - 8), window.innerWidth - 262) });
    const fuera = () => setAbierta(null);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setAbierta(null); btn.current?.focus(); } };
    document.addEventListener("click", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto, setAbierta]);

  return (
    <>
      <button ref={btn} className={"rounded p-[3px] leading-none hover:bg-[#EBF3FC] hover:text-[#378ADD] " + (excluidos.length ? "bg-[#EBF3FC] text-[#378ADD] opacity-100" : "text-gray-400 opacity-50")}
        aria-haspopup="dialog" aria-expanded={abierto} aria-label={`Filtrar ${col.t}`}
        onClick={(e) => {
          e.stopPropagation();
          // El buscador de valores se limpia acá, al ABRIR, y no en el efecto de cierre:
          // resetear estado dentro del cuerpo de un efecto dispara renders en cascada (lo
          // marca el lint de Docto). El resultado es el mismo — el panel siempre abre
          // vacío — y es el único apartamiento del port de OverCall.
          if (!abierto) setBuscaValor("");
          setAbierta(abierto ? null : col.k);
        }}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 2h10L7.2 6.4v3.9L4.8 11V6.4L1 2z" fill="currentColor" /></svg>
      </button>
      {abierto && pos && typeof document !== "undefined" && createPortal(
        // portal + position:fixed: si no, la tarjeta con overflow lo recortaría y el
        // text-transform de la cabecera le pondría todo en mayúsculas
        <div className="fixed z-[60] w-[252px] rounded-xl border border-gray-200 bg-white p-2 text-sm text-gray-900 shadow-lg" role="dialog" aria-label={`Filtrar ${col.t}`}
          style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
          <h3 className="mx-1 mb-2 mt-0.5 flex justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400"><span>{col.t}</span> <span className="font-normal normal-case tracking-normal">{valores.length} valores</span></h3>
          {muchos && (
            <input type="search" className="mb-[7px] w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#378ADD]" autoFocus placeholder="Buscar valor…"
              aria-label="Buscar valor" value={buscaValor} onChange={(e) => setBuscaValor(e.target.value)} />
          )}
          <div className="grid max-h-[232px] gap-px overflow-y-auto">
            {lista.length === 0 && <p className="px-2 py-2.5 text-center text-[12.5px] text-gray-400">Ningún valor con ese texto</p>}
            {lista.map((v, i) => (
              <label key={v.valor} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                <input type="checkbox" autoFocus={!muchos && i === 0}
                  checked={!excluidos.includes(v.valor)}
                  onChange={() => vista.alternarValor(col.k, v.valor)} />
                <span className="flex-1 truncate">{v.valor || "—"}</span>
                <span className="text-[11.5px] tabular-nums text-gray-400">{v.n}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5 border-t border-gray-100 pt-2 [&>button]:flex-1 [&>button]:rounded-lg [&>button]:border [&>button]:border-gray-200 [&>button]:py-1.5 [&>button]:text-[12px] [&>button]:font-medium [&>button]:text-gray-600 [&>button:hover]:bg-gray-50">
            <button onClick={() => vista.verTodos(col.k)}>Todos</button>
            <button onClick={() => vista.verNinguno(col.k)}>Ninguno</button>
            <button onClick={() => setAbierta(null)}>Listo</button>
          </div>
        </div>, document.body)}
    </>
  );
}

/** La sección "Históricos" al final de la MISMA tabla: lo que no se usa, plegado.
 *  Si la búsqueda encuentra algo adentro, se abre sola (si no, el buscador mentiría). */
export function Historicos<T>({ filas, colSpan, buscando, total, children }: {
  filas: T[]; colSpan: number; buscando: boolean; total?: number; children: (f: T) => ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const forzado = buscando && filas.length > 0;
  const ver = abierto || forzado;
  return (
    <tbody>
      <tr>
        <td colSpan={colSpan} className="border-t-2 border-gray-200 p-0">
          <button className="flex w-full items-center gap-2.5 bg-gray-50 px-2.5 py-2.5 text-left text-sm font-medium text-gray-600 hover:bg-[#EBF3FC] hover:text-gray-900" aria-expanded={ver} onClick={() => setAbierto(!ver)}>
            <span className="w-2.5 text-[#378ADD]" aria-hidden="true">{ver ? "▾" : "▸"}</span>
            Históricos <span className="text-[12px] font-normal text-gray-400">({total != null && total !== filas.length ? `${filas.length} de ${total}` : filas.length})</span>
            {forzado && !abierto ? <span className="text-[12px] font-normal text-gray-400"> — abierto por la búsqueda</span> : null}
          </button>
        </td>
      </tr>
      {ver && filas.map((f) => children(f))}
    </tbody>
  );
}
