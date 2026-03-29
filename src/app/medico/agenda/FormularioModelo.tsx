"use client";

import { useState, useTransition } from "react";
import { guardarModelo } from "./actions";

type Modelo = { id: string; nombre: string; fecha_inicio: string; fecha_fin: string; activo: boolean; prioridad: number };
type Franja = { dia_semana: number; hora_inicio: string; hora_fin: string };

const DIAS = [
  { num: 1, label: "L" },
  { num: 2, label: "M" },
  { num: 3, label: "X" },
  { num: 4, label: "J" },
  { num: 5, label: "V" },
  { num: 6, label: "S" },
  { num: 7, label: "D" },
];

const HORAS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTOS = ["00", "15", "30", "45"];

// 0 = no seleccionado, 1 = horario base (verde), 2 = personalizado (azul)
type DiaEstado = 0 | 1 | 2;

export default function FormularioModelo({
  modelosExistentes,
  duracionConsulta,
  precioConsulta,
}: {
  modelosExistentes: Modelo[];
  duracionConsulta: number;
  precioConsulta: number;
}) {
  const [nombre, setNombre] = useState("");
  const [duracionTurno, setDuracionTurno] = useState(duracionConsulta);
  const [precio, setPrecio] = useState(precioConsulta);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [dias, setDias] = useState<Record<number, DiaEstado>>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
  const [franjasBase, setFranjasBase] = useState<{ inicio: string; fin: string }[]>([
    { inicio: "09:00", fin: "13:00" },
  ]);
  const [franjasCustom, setFranjasCustom] = useState<Record<number, { inicio: string; fin: string }[]>>({});
  const [prioridad, setPrioridad] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Verificar overlap con modelos existentes
  const overlap = modelosExistentes.filter((m) =>
    m.activo && fechaInicio && fechaFin &&
    m.fecha_inicio <= fechaFin && m.fecha_fin >= fechaInicio
  );

  function toggleDia(num: number) {
    setDias((prev) => {
      const current = prev[num];
      const next: DiaEstado = current === 0 ? 1 : current === 1 ? 2 : 0;
      const updated = { ...prev, [num]: next };
      if (next === 2 && !franjasCustom[num]) {
        setFranjasCustom((fc) => ({ ...fc, [num]: [{ inicio: "09:00", fin: "13:00" }] }));
      }
      return updated;
    });
  }

  function addFranjaBase() {
    setFranjasBase((prev) => [...prev, { inicio: "14:00", fin: "18:00" }]);
  }

  function removeFranjaBase(idx: number) {
    setFranjasBase((prev) => prev.filter((_, i) => i !== idx));
  }

  function addFranjaCustom(dia: number) {
    setFranjasCustom((prev) => ({
      ...prev,
      [dia]: [...(prev[dia] ?? []), { inicio: "14:00", fin: "18:00" }],
    }));
  }

  function removeFranjaCustom(dia: number, idx: number) {
    setFranjasCustom((prev) => ({
      ...prev,
      [dia]: (prev[dia] ?? []).filter((_, i) => i !== idx),
    }));
  }

  function updateFranjaBase(idx: number, field: "inicio" | "fin", val: string) {
    setFranjasBase((prev) => prev.map((f, i) => i === idx ? { ...f, [field]: val } : f));
  }

  function updateFranjaCustom(dia: number, idx: number, field: "inicio" | "fin", val: string) {
    setFranjasCustom((prev) => ({
      ...prev,
      [dia]: (prev[dia] ?? []).map((f, i) => i === idx ? { ...f, [field]: val } : f),
    }));
  }

  function handleGuardar() {
    setError(null);
    if (!nombre.trim()) { setError("Ingresá un nombre para el modelo."); return; }
    if (!fechaInicio || !fechaFin) { setError("Seleccioná fechas de inicio y fin."); return; }

    const diasSeleccionados = Object.entries(dias).filter(([, v]) => v > 0).map(([k]) => parseInt(k));
    if (diasSeleccionados.length === 0) { setError("Seleccioná al menos un día."); return; }

    // Construir franjas
    const todasFranjas: Franja[] = [];
    for (const diaNum of diasSeleccionados) {
      const estado = dias[diaNum];
      const franjasDelDia = estado === 2 ? (franjasCustom[diaNum] ?? []) : franjasBase;
      for (const f of franjasDelDia) {
        todasFranjas.push({ dia_semana: diaNum, hora_inicio: f.inicio, hora_fin: f.fin });
      }
    }

    if (todasFranjas.length === 0) { setError("Agregá al menos una franja horaria."); return; }

    startTransition(async () => {
      const result = await guardarModelo({
        nombre: nombre.trim(),
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        prioridad,
        duracion_turno: duracionTurno,
        precio,
        franjas: todasFranjas,
      });
      if (result?.error) setError(result.error);
    });
  }

  const inputClass = "rounded-lg bg-[#f8f9fa] px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1D9E75]";
  const selectClass = "appearance-none rounded-lg bg-[#f8f9fa] px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1D9E75]";
  const borderStyle = { border: "0.5px solid #e5e7eb" };

  function FranjaRow({
    franja,
    onUpdate,
    onRemove,
    canRemove,
  }: {
    franja: { inicio: string; fin: string };
    onUpdate: (field: "inicio" | "fin", val: string) => void;
    onRemove: () => void;
    canRemove: boolean;
  }) {
    const [ih, im] = franja.inicio.split(":");
    const [fh, fm] = franja.fin.split(":");
    return (
      <div className="flex items-center gap-2">
        <select value={ih} onChange={(e) => onUpdate("inicio", `${e.target.value}:${im}`)} className={selectClass} style={borderStyle}>
          {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <span className="text-gray-300">:</span>
        <select value={im} onChange={(e) => onUpdate("inicio", `${ih}:${e.target.value}`)} className={selectClass} style={borderStyle}>
          {MINUTOS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="text-xs text-gray-400">a</span>
        <select value={fh} onChange={(e) => onUpdate("fin", `${e.target.value}:${fm}`)} className={selectClass} style={borderStyle}>
          {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <span className="text-gray-300">:</span>
        <select value={fm} onChange={(e) => onUpdate("fin", `${fh}:${e.target.value}`)} className={selectClass} style={borderStyle}>
          {MINUTOS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {canRemove && (
          <button onClick={onRemove} className="text-xs text-gray-400 hover:text-red-500">✕</button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-6" style={borderStyle}>
      <h2 className="text-sm font-medium text-gray-900">Nuevo modelo de agenda</h2>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {/* Nombre */}
      <div className="mt-4">
        <label className="text-xs text-gray-400">Nombre</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Semana laboral, Guardias, Vacaciones"
          className={`mt-1 w-full ${inputClass}`}
          style={borderStyle}
        />
      </div>

      {/* Duración y precio */}
      <div className="mt-4 flex gap-4">
        <div className="flex-1">
          <label className="text-xs text-gray-400">Duración del turno</label>
          <select value={duracionTurno} onChange={(e) => setDuracionTurno(parseInt(e.target.value))} className={`mt-1 w-full ${inputClass}`} style={borderStyle}>
            <option value={20}>20 minutos</option>
            <option value={30}>30 minutos</option>
            <option value={45}>45 minutos</option>
            <option value={60}>60 minutos</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-400">Precio (ARS)</label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-gray-400">$</span>
            <input type="number" min={0} value={precio} onChange={(e) => setPrecio(parseInt(e.target.value) || 0)} className={`w-full pl-7 ${inputClass}`} style={borderStyle} />
          </div>
        </div>
      </div>

      {/* Fechas */}
      <div className="mt-4 flex gap-4">
        <div className="flex-1">
          <label className="text-xs text-gray-400">Desde</label>
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={`mt-1 w-full ${inputClass}`} style={borderStyle} />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-400">Hasta</label>
          <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={`mt-1 w-full ${inputClass}`} style={borderStyle} />
        </div>
      </div>

      {/* Selector de días */}
      <div className="mt-5">
        <label className="text-xs text-gray-400">Días</label>
        <p className="mt-0.5 text-[10px] text-gray-400">1 toque = horario base · 2 toques = personalizado · 3 toques = quitar</p>
        <div className="mt-2 flex gap-2">
          {DIAS.map((d) => {
            const estado = dias[d.num];
            return (
              <button
                key={d.num}
                onClick={() => toggleDia(d.num)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg text-xs font-medium transition-all duration-100 active:scale-95 ${
                  estado === 2
                    ? "bg-blue-500 text-white"
                    : estado === 1
                      ? "bg-[#1D9E75] text-white"
                      : "bg-gray-100 text-gray-500"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Franjas base */}
      {Object.values(dias).some((v) => v === 1) && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">Franjas base ({duracionTurno} min c/turno)</label>
            <button onClick={addFranjaBase} className="text-xs text-[#1D9E75] hover:underline">+ Agregar franja</button>
          </div>
          <div className="mt-2 space-y-2">
            {franjasBase.map((f, i) => (
              <FranjaRow
                key={i}
                franja={f}
                onUpdate={(field, val) => updateFranjaBase(i, field, val)}
                onRemove={() => removeFranjaBase(i)}
                canRemove={franjasBase.length > 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* Franjas personalizadas por día */}
      {Object.entries(dias)
        .filter(([, v]) => v === 2)
        .map(([k]) => {
          const diaNum = parseInt(k);
          const franjasDelDia = franjasCustom[diaNum] ?? [];
          return (
            <div key={diaNum} className="mt-4 rounded-lg bg-blue-50 p-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-blue-700">
                  {["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][diaNum]} — personalizado
                </label>
                <button onClick={() => addFranjaCustom(diaNum)} className="text-xs text-blue-600 hover:underline">+ Agregar franja</button>
              </div>
              <div className="mt-2 space-y-2">
                {franjasDelDia.map((f, i) => (
                  <FranjaRow
                    key={i}
                    franja={f}
                    onUpdate={(field, val) => updateFranjaCustom(diaNum, i, field, val)}
                    onRemove={() => removeFranjaCustom(diaNum, i)}
                    canRemove={franjasDelDia.length > 1}
                  />
                ))}
              </div>
            </div>
          );
        })}

      {/* Prioridad */}
      {overlap.length > 0 && (
        <div className="mt-5 rounded-lg bg-amber-50 p-4" style={{ border: "0.5px solid #fbbf24" }}>
          <p className="text-xs text-amber-700">
            Este modelo se superpone con: <strong>{overlap.map((m) => m.nombre).join(", ")}</strong>
          </p>
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={prioridad > 1}
              onChange={(e) => setPrioridad(e.target.checked ? 2 : 1)}
              className="h-4 w-4 rounded border-gray-300 text-amber-600"
            />
            <span className="text-xs text-amber-700">Este modelo tiene prioridad sobre los existentes</span>
          </label>
        </div>
      )}

      {/* Acciones */}
      <div className="mt-6 flex gap-3">
        <a href="/medico/agenda" className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-center text-sm text-gray-700 hover:bg-gray-200">
          Cancelar
        </a>
        <button
          onClick={handleGuardar}
          disabled={isPending}
          className="flex-1 rounded-lg bg-[#1D9E75] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#178a64] disabled:opacity-50 active:scale-95 active:opacity-80 transition-all duration-100"
        >
          {isPending ? "Guardando..." : "Guardar modelo"}
        </button>
      </div>
    </div>
  );
}
