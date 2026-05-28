"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { esControlado } from "@/data/controlados";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Medicamento = {
  nombre: string;
  droga: string;
  presentacion?: string;
  laboratorio?: string;
  forma_farmaceutica?: string;
  via?: string;
  controlado?: boolean;
};

export type MedicamentoReceta = {
  id: string;
  nombre: string;        // Nombre comercial
  droga: string;          // IFA (denominación común)
  presentacion: string;
  forma_farmaceutica: string;
  via: string;
};

// ---------------------------------------------------------------------------
// Lazy-load del vademécum — NO se incluye en el bundle del workspace.
// Se carga con dynamic import() la primera vez que el usuario tipea ≥3 chars.
// Cache en variable de módulo: una sola carga por sesión del navegador.
// ---------------------------------------------------------------------------

let _vademecumCache: Medicamento[] | null = null;
let _vademecumPromise: Promise<Medicamento[]> | null = null;

function cargarVademecum(): Promise<Medicamento[]> {
  if (_vademecumCache) return Promise.resolve(_vademecumCache);
  if (_vademecumPromise) return _vademecumPromise;
  _vademecumPromise = import("@/data/vademecum.json").then((mod) => {
    _vademecumCache = mod.default as Medicamento[];
    return _vademecumCache;
  });
  return _vademecumPromise;
}

// ---------------------------------------------------------------------------
// Búsqueda fuzzy simple — normaliza acentos y busca substring
// ---------------------------------------------------------------------------

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function buscarSync(query: string): Medicamento[] {
  if (!_vademecumCache) return [];
  const q = normalizar(query);
  if (q.length < 3) return [];

  const resultados: { med: Medicamento; score: number }[] = [];

  for (const med of _vademecumCache) {
    const nombre = normalizar(med.nombre);
    const droga = normalizar(med.droga || "");
    let score = 0;
    if (droga && droga.startsWith(q)) score = 100;
    else if (droga && droga.includes(q)) score = 70;
    else if (nombre.startsWith(q)) score = 50;
    else if (nombre.includes(q)) score = 30;
    if (score === 0) continue;
    resultados.push({ med, score });
  }

  resultados.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.med.nombre.localeCompare(b.med.nombre, "es");
  });
  return resultados.slice(0, 8).map((r) => r.med);
}

// ---------------------------------------------------------------------------
// Generar ID único
// ---------------------------------------------------------------------------

let counter = 0;
function uid(): string {
  return `med_${Date.now()}_${++counter}`;
}

// ---------------------------------------------------------------------------
// Componente: línea de medicamento expandida con campos editables
// ---------------------------------------------------------------------------

function LineaMedicamento({
  med,
  onRemove,
}: {
  med: MedicamentoReceta;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex items-start justify-between gap-2 rounded-lg bg-white px-3 py-2.5 mb-2"
      style={{ border: "0.5px solid #e5e7eb" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">
          {med.nombre}
          {med.droga && med.droga !== med.nombre && (
            <span className="ml-1.5 text-xs font-normal text-gray-400">
              ({med.droga})
            </span>
          )}
        </p>
        <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
          {med.forma_farmaceutica && (
            <span>Forma: {med.forma_farmaceutica}</span>
          )}
          {med.presentacion && (
            <span>Presentaci&oacute;n: {med.presentacion}</span>
          )}
          {med.via && (
            <span>V&iacute;a: {med.via}</span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-md p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
        style={{ minHeight: "44px", minWidth: "44px" }}
        aria-label="Eliminar medicamento"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function MedicamentoAutocomplete({
  medicamentos,
  onMedicamentosChange,
  textoLibre,
  onTextoLibreChange,
  dictando,
  onIniciarDictado,
  onDetenerDictado,
}: {
  medicamentos: MedicamentoReceta[];
  onMedicamentosChange: (meds: MedicamentoReceta[]) => void;
  textoLibre: string;
  onTextoLibreChange: (v: string) => void;
  dictando: string | null;
  onIniciarDictado: () => void;
  onDetenerDictado: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sugerencias, setSugerencias] = useState<Medicamento[]>([]);
  const [showSugerencias, setShowSugerencias] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [bloqueadoControlado, setBloqueadoControlado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activo = dictando === "receta";

  // Buscar al escribir — debounce 150ms
  // Lazy-load: si el vademécum no está cargado, lo carga primero
  useEffect(() => {
    if (query.length < 3) {
      setSugerencias([]);
      setShowSugerencias(false);
      return;
    }

    const timer = setTimeout(async () => {
      // Si no está cargado, disparar carga
      if (!_vademecumCache) {
        setCargando(true);
        await cargarVademecum();
        setCargando(false);
      }

      const results = buscarSync(query);
      setSugerencias(results);
      setShowSugerencias(results.length > 0);
      setSelectedIndex(-1);
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSugerencias(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Agregar medicamento del vademécum
  const agregarMedicamento = useCallback(
    (med: Medicamento) => {
      const droga = med.droga?.trim() || med.nombre;

      // Usar flag nativo CNPM + fallback a lista manual
      if (med.controlado || esControlado(droga)) {
        setBloqueadoControlado(droga);
        setQuery("");
        setShowSugerencias(false);
        return;
      }

      const nuevo: MedicamentoReceta = {
        id: uid(),
        nombre: med.nombre,
        droga: med.droga || "",
        presentacion: med.presentacion || "",
        forma_farmaceutica: med.forma_farmaceutica || "",
        via: med.via || "",
      };
      onMedicamentosChange([...medicamentos, nuevo]);
      setQuery("");
      setShowSugerencias(false);
      inputRef.current?.focus();
    },
    [medicamentos, onMedicamentosChange]
  );

  // Teclado en el input de búsqueda
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showSugerencias) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < sugerencias.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      agregarMedicamento(sugerencias[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowSugerencias(false);
    }
  }

  // Eliminar medicamento
  function removeMed(id: string) {
    onMedicamentosChange(medicamentos.filter((m) => m.id !== id));
  }

  return (
    <div className="mt-4">
      {/* Header con dictado */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-gray-400">
          RECETA
        </p>
        <button
          type="button"
          onMouseDown={onIniciarDictado}
          onMouseUp={onDetenerDictado}
          onTouchStart={onIniciarDictado}
          onTouchEnd={onDetenerDictado}
          className={`rounded-md px-2 py-1 text-xs transition ${
            activo
              ? "bg-red-100 text-red-600"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
          style={{ minHeight: "44px", minWidth: "44px" }}
        >
          {activo ? "Dictando..." : "Dictar"}
        </button>
      </div>

      {/* Medicamentos agregados — expandidos con campos editables */}
      {medicamentos.length > 0 && (
        <div className="mt-2">
          {medicamentos.map((med) => (
            <LineaMedicamento
              key={med.id}
              med={med}
              onRemove={() => removeMed(med.id)}
            />
          ))}
        </div>
      )}

      {/* Buscador de medicamentos */}
      <div className="relative mt-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (sugerencias.length > 0 && query.length >= 3) {
                  setShowSugerencias(true);
                }
              }}
              placeholder="Buscar medicamento..."
              className="w-full rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
              style={{ border: "0.5px solid #e5e7eb", minHeight: "44px" }}
            />
            {/* Icono de búsqueda o loading */}
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              {cargando ? (
                <svg width="16" height="16" viewBox="0 0 24 24" className="animate-spin" fill="none" stroke="#378ADD" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* Dropdown de sugerencias */}
        {showSugerencias && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 z-50 mt-1 max-h-[280px] overflow-y-auto rounded-lg bg-white shadow-lg"
            style={{ border: "1px solid #e5e7eb" }}
          >
            {sugerencias.map((med, i) => (
              <button
                key={`${med.nombre}-${med.laboratorio}-${med.presentacion}`}
                type="button"
                onClick={() => agregarMedicamento(med)}
                className={`w-full text-left px-3 py-2.5 transition ${
                  i === selectedIndex
                    ? "bg-blue-50"
                    : "hover:bg-gray-50"
                }`}
                style={{ minHeight: "44px" }}
              >
                <p className="text-sm font-medium text-gray-900">
                  {med.nombre}
                  {med.laboratorio && (
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      ({med.laboratorio})
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {med.droga}{med.presentacion ? ` — ${med.presentacion}` : ""}
                  {med.forma_farmaceutica && (
                    <span className="ml-1 text-gray-400">
                      · {med.forma_farmaceutica}
                    </span>
                  )}
                  {med.via && (
                    <span className="ml-1 text-gray-400">
                      · {med.via}
                    </span>
                  )}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Texto libre para lo que no está en el vademécum */}
      <textarea
        value={textoLibre}
        onChange={(e) => onTextoLibreChange(e.target.value)}
        rows={2}
        placeholder="Posología e indicaciones: dosis, frecuencia, duración. Ej: Tomar 1 comp de 10 mg cada 12 hs por 7 días. También medicamentos no listados o magistrales."
        className="mt-2 w-full resize-none rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
        style={{ border: "0.5px solid #e5e7eb" }}
      />

      <p className="mt-1 text-[10px] text-gray-400">
        Buscá por nombre comercial o droga (IFA). Si no aparece, escribilo en texto libre.
      </p>

      {/* Dialog de bloqueo de controlados */}
      {bloqueadoControlado && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: 24,
          }}
          onClick={() => setBloqueadoControlado(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 16, padding: "28px 24px",
              maxWidth: 420, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <p style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: 0 }}>
                Receta de controlados — próximamente
              </p>
            </div>
            <p style={{ fontSize: 14, color: "#4B5563", lineHeight: 1.6, margin: "0 0 12px" }}>
              Los medicamentos con <strong>{bloqueadoControlado}</strong> están incluidos en las listas de psicotrópicos y estupefacientes (Ley 17.818 y Ley 19.303).
            </p>
            <p style={{ fontSize: 14, color: "#4B5563", lineHeight: 1.6, margin: "0 0 12px" }}>
              Las recetas de psicotrópicos y estupefacientes requieren un circuito de trazabilidad especial que estará disponible próximamente en Docto.
            </p>
            <p style={{ fontSize: 14, color: "#4B5563", lineHeight: 1.6, margin: "0 0 20px" }}>
              Mientras tanto, emití esta receta por el canal habitual que utilices para controlados.
            </p>
            <button
              type="button"
              onClick={() => setBloqueadoControlado(null)}
              style={{
                width: "100%", padding: "12px 0", background: "#378ADD", color: "#fff",
                fontSize: 14, fontWeight: 500, border: "none", borderRadius: 10,
                cursor: "pointer",
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
