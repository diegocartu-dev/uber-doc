"use client";

// Lista de modelos de agenda del medico
// Extensiones pendientes:
// - Boton "Editar" por modelo -> abre FormularioModelo con datos precargados
// - Indicador de turnos reservados por modelo
// - Boton "Bloquear dia" para bloqueos puntuales

import { useState, useTransition } from "react";
import { toggleModelo, eliminarModelo } from "./actions";
import OrigenBadge from "@/components/OrigenBadge";

type Franja = { id: string; dia_semana: number; hora_inicio: string; hora_fin: string };
type Modelo = {
  id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  prioridad: number;
  canal_origen: string | null;
  duracion_turno: number | null;
  precio: number | null;
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
  const [eliminarId, setEliminarId] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  const [errorToggle, setErrorToggle] = useState<string | null>(null);

  function handleToggle(id: string, activo: boolean) {
    setErrorToggle(null);
    const anterior = modelos;
    setModelos((prev) => prev.map((m) => m.id === id ? { ...m, activo } : m));
    startTransition(async () => {
      const res = await toggleModelo(id, activo);
      if (res && "error" in res) {
        setModelos(anterior); // revertir el cambio optimista
        setErrorToggle(res.error ?? "No se pudo guardar el cambio. Probá de nuevo.");
        return;
      }
      // Avisar al calendario (PanelDerecho) para que recargue sus turnos
      window.dispatchEvent(new CustomEvent("agenda:changed"));
    });
  }

  function abrirEliminar(id: string) {
    setErrorEliminar(null);
    setEliminarId(id);
  }

  function confirmarEliminar() {
    if (!eliminarId) return;
    const id = eliminarId;
    setEliminando(true);
    setErrorEliminar(null);
    startTransition(async () => {
      const res = await eliminarModelo(id);
      setEliminando(false);
      if (res && "error" in res) {
        setErrorEliminar(res.error ?? "No se pudo eliminar la agenda. Probá de nuevo."); // se muestra en el dialog; la card NO se quita
        return;
      }
      setModelos((prev) => prev.filter((m) => m.id !== id));
      setEliminarId(null);
      window.dispatchEvent(new CustomEvent("agenda:changed"));
    });
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
        <p className="mt-3 text-[14px] text-gray-500">No tenés agendas creadas.</p>
        <p className="mt-1 text-[13px] text-gray-400">Creá una para recibir turnos programados.</p>
      </div>
    );
  }

  return (
    <>
      {/* Banner de error de toggle (inhabilitar/habilitar) */}
      {errorToggle && (
        <div
          className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-[#E24B4A]"
          style={{ border: "1px solid #E24B4A" }}
        >
          {errorToggle}
        </div>
      )}

      {/* Dialog eliminar */}
      {eliminarId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!eliminando) { setEliminarId(null); setErrorEliminar(null); } }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[16px] font-semibold text-gray-900">Eliminar agenda</p>
            {errorEliminar ? (
              <>
                <p className="mt-2 text-[14px] text-[#E24B4A]">{errorEliminar}</p>
                <div className="mt-5">
                  <button
                    onClick={() => { setEliminarId(null); setErrorEliminar(null); }}
                    className="w-full min-h-[44px] rounded-lg bg-gray-100 text-[14px] font-medium text-gray-600 transition hover:bg-gray-200"
                  >
                    Entendido
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-[14px] text-gray-500">¿Estás seguro? Los turnos disponibles de esta agenda se van a eliminar. Esta acción no se puede deshacer.</p>
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={confirmarEliminar}
                    disabled={eliminando}
                    className="flex-1 min-h-[44px] rounded-lg text-[14px] font-medium text-[#E24B4A] transition hover:bg-red-50 disabled:opacity-50"
                    style={{ border: "1px solid #E24B4A" }}
                  >
                    {eliminando ? "Eliminando..." : "Eliminar"}
                  </button>
                  <button
                    onClick={() => setEliminarId(null)}
                    disabled={eliminando}
                    className="flex-1 min-h-[44px] rounded-lg bg-gray-100 text-[14px] font-medium text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {modelos.map((m) => {
        const diasActivos = [...new Set(m.franjas.map((f) => f.dia_semana))].sort();
        const isExpanded = expandedIds.has(m.id);
        // Agenda vencida = fecha_fin pasada: dejó de generar slots aunque el
        // toggle siga verde. Antes moría en silencio (bug conocido de la spec).
        const hoyISO = new Date().toLocaleDateString("sv-SE");
        const vencida = m.fecha_fin < hoyISO;

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
                <p className="text-[16px] md:text-[18px] font-semibold text-gray-900 truncate">{m.nombre.charAt(0).toUpperCase() + m.nombre.slice(1)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <OrigenBadge canalOrigen={m.canal_origen} />
                  {vencida && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "#FBEEE6", color: "#D85A30" }}>
                      Vencida — ya no ofrece turnos
                    </span>
                  )}
                  {m.duracion_turno && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{m.duracion_turno} min</span>
                  )}
                  {m.precio != null && m.precio > 0 && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">${m.precio.toLocaleString("es-AR")}</span>
                  )}
                </div>
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
                  onClick={() => abrirEliminar(m.id)}
                  className="min-h-[44px] rounded-lg px-4 text-[13px] text-[#E24B4A] font-medium hover:bg-red-50 transition-colors"
                >
                  Eliminar agenda
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
