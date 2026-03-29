"use client";

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

const DIAS = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function formatFecha(f: string) {
  return new Date(f + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export default function ListaModelos({ modelos: modelosIniciales }: { modelos: Modelo[] }) {
  const [modelos, setModelos] = useState(modelosIniciales);
  const [isPending, startTransition] = useTransition();

  function handleToggle(id: string, activo: boolean) {
    setModelos((prev) => prev.map((m) => m.id === id ? { ...m, activo } : m));
    startTransition(async () => {
      await toggleModelo(id, activo);
    });
  }

  function handleEliminar(id: string) {
    if (!confirm("¿Eliminar este modelo de agenda?")) return;
    setModelos((prev) => prev.filter((m) => m.id !== id));
    startTransition(async () => {
      await eliminarModelo(id);
    });
  }

  if (modelos.length === 0) {
    return (
      <div className="mt-12 text-center">
        <p className="text-3xl">📅</p>
        <p className="mt-3 text-sm text-gray-500">
          No tenés modelos de agenda. Creá uno para recibir turnos programados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {modelos.map((m) => {
        const diasActivos = [...new Set(m.franjas.map((f) => f.dia_semana))].sort();

        return (
          <div
            key={m.id}
            className="rounded-xl bg-white p-5"
            style={{ border: "0.5px solid #e5e7eb", opacity: m.activo ? 1 : 0.6 }}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{m.nombre}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    m.prioridad > 1
                      ? "bg-amber-100 text-amber-700"
                      : "bg-green-100 text-green-700"
                  }`}>
                    {m.prioridad > 1 ? "Alta" : "Base"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {formatFecha(m.fecha_inicio)} — {formatFecha(m.fecha_fin)}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggle(m.id, !m.activo)}
                  disabled={isPending}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                    m.activo ? "bg-[#1D9E75]" : "bg-gray-300"
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                    m.activo ? "translate-x-4" : "translate-x-0.5"
                  }`} />
                </button>
                <button
                  onClick={() => handleEliminar(m.id)}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  Eliminar
                </button>
              </div>
            </div>

            {/* Días activos */}
            <div className="mt-3 flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <span
                  key={d}
                  className={`flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-medium ${
                    diasActivos.includes(d)
                      ? "bg-[#1D9E75] text-white"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {DIAS[d]}
                </span>
              ))}
            </div>

            {/* Franjas */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {m.franjas
                .sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio))
                .map((f) => (
                  <span key={f.id} className="rounded bg-gray-50 px-2 py-0.5 text-[10px] text-gray-500" style={{ border: "0.5px solid #e5e7eb" }}>
                    {DIAS[f.dia_semana]} {f.hora_inicio.slice(0, 5)}-{f.hora_fin.slice(0, 5)}
                  </span>
                ))
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}
