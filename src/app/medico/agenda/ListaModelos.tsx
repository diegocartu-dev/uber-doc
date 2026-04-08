"use client";

// Lista de modelos de agenda del medico
// Extensiones pendientes:
// - Boton "Editar" por modelo -> abre FormularioModelo con datos precargados
// - Indicador de turnos reservados por modelo
// - Boton "Bloquear dia" para bloqueos puntuales

import { useState, useTransition } from "react";
import { toggleModelo, eliminarModelo } from "./actions";

type Franja = { id: string; dia_semana: number; hora_inicio: string; hora_fin: string };
type Modelo = {
  id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  prioridad: number;
  franjas: Franja[];
};

const DIAS_CORTO = ["", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const DIAS_LETRA = ["", "L", "M", "X", "J", "V", "S", "D"];

function formatFecha(f: string) {
  const d = new Date(f + "T12:00:00");
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
}

export default function ListaModelos({ modelos: modelosIniciales }: { modelos: Modelo[] }) {
  const [modelos, setModelos] = useState(modelosIniciales);
  const [isPending, startTransition] = useTransition();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function handleToggle(id: string, activo: boolean) {
    setModelos((prev) => prev.map((m) => m.id === id ? { ...m, activo } : m));
    startTransition(async () => { await toggleModelo(id, activo); });
  }

  function handleEliminar(id: string) {
    if (!confirm("Eliminar este modelo de agenda?")) return;
    setModelos((prev) => prev.filter((m) => m.id !== id));
    startTransition(async () => { await eliminarModelo(id); });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (modelos.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center" style={{ border: "0.5px solid #e5e7eb" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto" }}><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
        <p className="mt-3 text-[14px] text-gray-500">No tenes modelos de agenda.</p>
        <p className="mt-1 text-[13px] text-gray-400">Crea uno para recibir turnos programados.</p>
      </div>
    );
  }

  return (
    <>
      {modelos.map((m) => {
        const diasActivos = [...new Set(m.franjas.map((f) => f.dia_semana))].sort();
        const isExpanded = expandedIds.has(m.id);

        // Group franjas by dia for readable display
        const franjasPorDia = new Map<number, string[]>();
        for (const f of m.franjas.sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio))) {
          if (!franjasPorDia.has(f.dia_semana)) franjasPorDia.set(f.dia_semana, []);
          franjasPorDia.get(f.dia_semana)!.push(`${f.hora_inicio.slice(0, 5)}–${f.hora_fin.slice(0, 5)}`);
        }

        return (
          <div
            key={m.id}
            className="rounded-xl bg-white"
            style={{ border: "0.5px solid #e5e7eb", padding: "16px 20px", opacity: m.activo ? 1 : 0.5 }}
          >
            {/* Header — siempre visible, tocable en mobile para expandir */}
            <button
              onClick={() => toggleExpand(m.id)}
              className="flex w-full items-center justify-between text-left md:cursor-default"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[16px] md:text-[18px] font-semibold text-gray-900 truncate">{m.nombre}</p>
                <p className="mt-0.5 text-[13px] text-gray-500">
                  {formatFecha(m.fecha_inicio)} — {formatFecha(m.fecha_fin)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Toggle activo/inactivo — siempre visible */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggle(m.id, !m.activo); }}
                  disabled={isPending}
                  className={`relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors w-[44px] h-[26px] ${
                    m.activo ? "bg-[#1D9E75]" : "bg-gray-300"
                  }`}
                >
                  <span className={`inline-block h-[20px] w-[20px] rounded-full bg-white shadow transition-transform ${
                    m.activo ? "translate-x-[20px]" : "translate-x-[3px]"
                  }`} />
                </button>
                {/* Chevron mobile */}
                <span className={`md:hidden text-gray-400 text-[14px] transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </div>
            </button>

            {/* Contenido expandible — siempre visible en desktop, collapsible en mobile */}
            <div className={`${isExpanded ? "block" : "hidden"} md:block`}>
              {/* Dias */}
              <div className="mt-4 flex flex-wrap gap-[6px]">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                  const activo = diasActivos.includes(d);
                  return (
                    <span
                      key={d}
                      className={`flex min-w-[44px] min-h-[44px] items-center justify-center rounded-lg text-[13px] font-medium ${
                        activo ? "bg-[#1D9E75] text-white" : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {DIAS_LETRA[d]}
                    </span>
                  );
                })}
              </div>

              {/* Horarios legibles */}
              <div className="mt-3 flex flex-wrap gap-2">
                {[...franjasPorDia.entries()].map(([dia, horas]) => (
                  <span key={dia} className="rounded-lg bg-gray-50 px-2.5 py-1 text-[12px] text-gray-600" style={{ border: "0.5px solid #e5e7eb" }}>
                    {DIAS_CORTO[dia]} {horas.join(", ")}
                  </span>
                ))}
              </div>

              {/* Eliminar */}
              <div className="mt-4">
                <button
                  onClick={() => handleEliminar(m.id)}
                  className="min-h-[44px] rounded-lg px-4 text-[13px] text-[#E24B4A] font-medium hover:bg-red-50 transition-colors"
                >
                  Eliminar modelo
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
