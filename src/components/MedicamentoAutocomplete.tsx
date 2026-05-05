"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import vademecum from "@/data/vademecum.json";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Medicamento = {
  nombre: string;
  droga: string;
  presentacion: string;
  laboratorio: string;
};

export type MedicamentoReceta = {
  id: string;
  nombre: string;
  droga: string;
  presentacion: string;
  dosis: string;
  frecuencia: string;
  duracion: string;
  cantidad: string;
  unidad: string;
  posologia: string;
};

const POSOLOGIA_MAX = 300;

export const UNIDADES_MEDICAMENTO = [
  "comprimidos",
  "cápsulas",
  "ml",
  "sobres",
  "gotas",
  "parches",
  "unidades",
  "otro",
] as const;

// ---------------------------------------------------------------------------
// Búsqueda fuzzy simple — normaliza acentos y busca substring
// ---------------------------------------------------------------------------

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buscar(query: string): Medicamento[] {
  const q = normalizar(query);
  if (q.length < 3) return [];

  // Ranking ponderado:
  //   100 — droga.startsWith(q)        (match exacto al inicio del IFA)
  //    70 — droga.includes(q)          (IFA en posición intermedia, ej. asociaciones)
  //    50 — nombre.startsWith(q)       (match exacto al inicio de marca comercial)
  //    30 — nombre.includes(q)         (marca comercial en posición intermedia)
  // Esto evita basura tipo "Oxibutinina" para query "Ibu" o "Dispositivo PARA insulina".
  const resultados: { med: Medicamento; score: number }[] = [];

  for (const med of vademecum as Medicamento[]) {
    const nombre = normalizar(med.nombre);
    const droga = normalizar(med.droga);
    let score = 0;
    if (droga.startsWith(q)) score = 100;
    else if (droga.includes(q)) score = 70;
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
// Componente línea de medicamento
// ---------------------------------------------------------------------------

function LineaMedicamento({
  med,
  onChange,
  onRemove,
}: {
  med: MedicamentoReceta;
  onChange: (updated: MedicamentoReceta) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="rounded-lg bg-white px-3 py-2.5 mb-2"
      style={{ border: "0.5px solid #e5e7eb" }}
    >
      {/* Header: nombre + botón eliminar */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">
            {med.nombre}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-md p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
          style={{ minHeight: "32px", minWidth: "32px" }}
          aria-label="Eliminar medicamento"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Presentación (autocompletada del vademécum, editable) */}
      <div className="mt-2">
        <label className="block text-[10px] font-medium tracking-wide text-gray-400 mb-1">
          PRESENTACIÓN
        </label>
        <input
          type="text"
          value={med.presentacion}
          onChange={(e) => onChange({ ...med, presentacion: e.target.value })}
          placeholder="Ej: comp.recub. 500mg x 30"
          className="w-full rounded-md border px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
          style={{ border: "0.5px solid #e5e7eb", minHeight: "36px" }}
        />
      </div>

      {/* Campos de posología */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <input
          type="text"
          value={med.dosis}
          onChange={(e) => onChange({ ...med, dosis: e.target.value })}
          placeholder="Dosis"
          className="rounded-md border px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
          style={{ border: "0.5px solid #e5e7eb", minHeight: "36px" }}
        />
        <input
          type="text"
          value={med.frecuencia}
          onChange={(e) => onChange({ ...med, frecuencia: e.target.value })}
          placeholder="Frecuencia"
          className="rounded-md border px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
          style={{ border: "0.5px solid #e5e7eb", minHeight: "36px" }}
        />
        <input
          type="text"
          value={med.duracion}
          onChange={(e) => onChange({ ...med, duracion: e.target.value })}
          placeholder="Duración"
          className="rounded-md border px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
          style={{ border: "0.5px solid #e5e7eb", minHeight: "36px" }}
        />
      </div>

      {/* Cantidad + unidad (requerido por ReNaPDiS) */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          type="number"
          inputMode="numeric"
          min="1"
          value={med.cantidad}
          onChange={(e) => onChange({ ...med, cantidad: e.target.value })}
          placeholder="Cantidad"
          className="rounded-md border px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
          style={{ border: "0.5px solid #e5e7eb", minHeight: "36px" }}
        />
        <select
          value={med.unidad || "comprimidos"}
          onChange={(e) => onChange({ ...med, unidad: e.target.value })}
          className="rounded-md border bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
          style={{ border: "0.5px solid #e5e7eb", minHeight: "36px" }}
        >
          {UNIDADES_MEDICAMENTO.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      {/* Posología / indicaciones de uso */}
      <div className="mt-2">
        <label className="block text-[10px] font-medium tracking-wide text-gray-400 mb-1">
          POSOLOGIA / INDICACIONES DE USO
        </label>
        <textarea
          value={med.posologia ?? ""}
          onChange={(e) =>
            onChange({ ...med, posologia: e.target.value.slice(0, POSOLOGIA_MAX) })
          }
          maxLength={POSOLOGIA_MAX}
          rows={2}
          placeholder="Ej: 1 comprimido cada 8 hs durante 7 días, con las comidas"
          className="w-full resize-none rounded-md border px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
          style={{ border: "0.5px solid #e5e7eb", minHeight: "44px" }}
        />
      </div>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activo = dictando === "receta";

  // Buscar al escribir — debounce 150ms para ~8000 medicamentos
  useEffect(() => {
    const timer = setTimeout(() => {
      const results = buscar(query);
      setSugerencias(results);
      setShowSugerencias(results.length > 0 && query.length >= 3);
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
  // Formato receta: "Droga (Nombre comercial)" — presentación va en campo separado
  const agregarMedicamento = useCallback(
    (med: Medicamento) => {
      const droga = med.droga?.trim() || med.nombre;
      const nombreReceta = droga !== med.nombre ? `${droga} (${med.nombre})` : med.nombre;
      const nuevo: MedicamentoReceta = {
        id: uid(),
        nombre: nombreReceta,
        droga: med.droga,
        presentacion: med.presentacion,
        dosis: "",
        frecuencia: "",
        duracion: "",
        cantidad: "",
        unidad: "comprimidos",
        posologia: "",
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

  // Actualizar un medicamento
  function updateMed(id: string, updated: MedicamentoReceta) {
    onMedicamentosChange(
      medicamentos.map((m) => (m.id === id ? updated : m))
    );
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

      {/* Medicamentos agregados */}
      {medicamentos.length > 0 && (
        <div className="mt-2">
          {medicamentos.map((med) => (
            <LineaMedicamento
              key={med.id}
              med={med}
              onChange={(updated) => updateMed(med.id, updated)}
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
            {/* Icono de búsqueda */}
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
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
                key={`${med.nombre}-${med.laboratorio}`}
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
                  {med.laboratorio !== "Genérico" && (
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      ({med.laboratorio})
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {med.droga} - {med.presentacion}
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
        placeholder="Texto libre: medicamentos no listados, magistrales, u observaciones..."
        className="mt-2 w-full resize-none rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
        style={{ border: "0.5px solid #e5e7eb" }}
      />

      <p className="mt-1 text-[10px] text-gray-400">
        Buscá por nombre comercial o droga (IFA). Si no aparece, escribilo en texto libre.
      </p>
    </div>
  );
}
