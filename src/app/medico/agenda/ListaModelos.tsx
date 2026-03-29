"use client";

// Lista de modelos de agenda del médico
// Extensiones pendientes:
// - Botón "Editar" por modelo → abre FormularioModelo con datos precargados
// - Indicador de turnos reservados por modelo
// - Botón "Bloquear día" para bloqueos puntuales

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

const DIAS_CORTO = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIAS_LETRA = ["", "L", "M", "X", "J", "V", "S", "D"];

function formatFecha(f: string) {
  const d = new Date(f + "T12:00:00");
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
}

export default function ListaModelos({ modelos: modelosIniciales }: { modelos: Modelo[] }) {
  const [modelos, setModelos] = useState(modelosIniciales);
  const [isPending, startTransition] = useTransition();

  function handleToggle(id: string, activo: boolean) {
    setModelos((prev) => prev.map((m) => m.id === id ? { ...m, activo } : m));
    startTransition(async () => { await toggleModelo(id, activo); });
  }

  function handleEliminar(id: string) {
    if (!confirm("¿Eliminar este modelo de agenda?")) return;
    setModelos((prev) => prev.filter((m) => m.id !== id));
    startTransition(async () => { await eliminarModelo(id); });
  }

  if (modelos.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center" style={{ border: "0.5px solid #e5e7eb" }}>
        <p className="text-[28px]">📅</p>
        <p className="mt-3 text-[14px] text-gray-500">No tenés modelos de agenda.</p>
        <p className="mt-1 text-[13px] text-gray-400">Creá uno para recibir turnos programados.</p>
      </div>
    );
  }

  return (
    <>
      {modelos.map((m) => {
        const diasActivos = [...new Set(m.franjas.map((f) => f.dia_semana))].sort();

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
            style={{ border: "0.5px solid #e5e7eb", padding: "20px 24px", opacity: m.activo ? 1 : 0.5, minHeight: "140px" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-[18px] font-semibold text-gray-900">{m.nombre}</p>
                <p className="mt-1 text-[13px] text-gray-500">
                  {formatFecha(m.fecha_inicio)} — {formatFecha(m.fecha_fin)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleToggle(m.id, !m.activo)}
                  disabled={isPending}
                  className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                    m.activo ? "bg-[#1D9E75]" : "bg-gray-300"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    m.activo ? "translate-x-5" : "translate-x-0.5"
                  }`} />
                </button>
              </div>
            </div>

            {/* Días */}
            <div className="mt-4 flex gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const activo = diasActivos.includes(d);
                return (
                  <span
                    key={d}
                    className={`flex h-8 min-w-[40px] items-center justify-center rounded-lg text-[13px] font-medium ${
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
            <div className="mt-3">
              <button onClick={() => handleEliminar(m.id)} className="text-[12px] text-red-400 hover:text-red-600">
                Eliminar modelo
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
