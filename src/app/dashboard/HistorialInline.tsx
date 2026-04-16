"use client";

import { useState } from "react";
import OrigenBadge from "@/components/OrigenBadge";
import { capitalizarNombre } from "@/lib/utils/texto";

type Item = {
  id: string;
  paciente_nombre: string;
  fecha: string;
  url: string;
  canal_origen?: string;
};

export default function HistorialInline({
  medicoId,
  tipo,
}: {
  medicoId: string;
  tipo: "consulta" | "turno";
}) {
  const [abierto, setAbierto] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [cargado, setCargado] = useState(false);

  async function toggle() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setAbierto(true);
    if (cargado) return;

    try {
      const res = await fetch(
        `/api/historial-inline?medicoId=${medicoId}&tipo=${tipo}`,
        { credentials: "include" }
      );
      if (!res.ok) return;
      const data: Item[] = await res.json();
      setItems(data);
      setCargado(true);
    } catch {}
  }

  const accentColor = tipo === "turno" ? "#378ADD" : "#1D9E75";

  return (
    <div className="w-full">
      <button
        onClick={toggle}
        className="text-base font-medium transition-colors"
        style={{ color: `${accentColor}99`, }}
      >
        {abierto ? "Cerrar historial ×" : (tipo === "turno" ? "Historial de turnos →" : "Historial de consultas →")}
      </button>

      {abierto && (
        <div className="mt-3 w-full max-h-[320px] overflow-y-auto rounded-xl bg-white" style={{ border: "0.5px solid #e5e7eb", borderLeft: `3px solid ${accentColor}` }}>
          {/* Header con identidad de tipo */}
          <div className="px-4 py-2.5" style={{ borderBottom: "0.5px solid #e5e7eb", background: `${accentColor}08` }}>
            <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: accentColor }}>
              {tipo === "turno" ? "Historial de turnos" : "Historial de consultas"}
            </p>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              {cargado ? (tipo === "turno" ? "Sin turnos completados" : "Sin consultas completadas") : "Cargando..."}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-base font-medium text-gray-900">{capitalizarNombre(item.paciente_nombre)}</p>
                      <OrigenBadge canalOrigen={item.canal_origen ?? null} />
                    </div>
                    <p className="text-sm text-gray-400">{item.fecha}</p>
                  </div>
                  <a
                    href={`${item.url}?desde=${tipo}`}
                    className="shrink-0 text-sm font-medium hover:underline"
                    style={{ color: accentColor }}
                  >
                    Ver documentos
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
