"use client";

import { useState } from "react";

type Item = {
  id: string;
  paciente_nombre: string;
  fecha: string;
  url: string;
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

  return (
    <div>
      <button onClick={toggle} className={`text-base font-medium transition-colors ${tipo === "turno" ? "text-[#378ADD]/60 hover:text-[#378ADD]" : "text-[#1D9E75]/60 hover:text-[#1D9E75]"}`}>
        {abierto ? "Cerrar historial ×" : (tipo === "turno" ? "Historial de turnos →" : "Historial de consultas →")}
      </button>

      {abierto && (
        <div className={`mt-3 max-h-[320px] overflow-y-auto rounded-lg border-l-[3px] ${tipo === "turno" ? "border-l-[#378ADD]" : "border-l-[#1D9E75]"}`} style={{ borderTop: "0.5px solid #e5e7eb", borderRight: "0.5px solid #e5e7eb", borderBottom: "0.5px solid #e5e7eb" }}>
          {/* Header del historial */}
          <div className={`px-4 py-2.5 ${tipo === "turno" ? "bg-[#378ADD]/5" : "bg-[#1D9E75]/5"}`}>
            <p className={`text-xs font-medium tracking-wide uppercase ${tipo === "turno" ? "text-[#378ADD]" : "text-[#1D9E75]"}`}>
              {tipo === "turno" ? "Turnos completados" : "Consultas completadas"}
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
                    <p className="text-base font-medium text-gray-900">{item.paciente_nombre}</p>
                    <p className="text-sm text-gray-400">{item.fecha}</p>
                  </div>
                  <a
                    href={`${item.url}?desde=${tipo}`}
                    className={`shrink-0 text-sm font-medium hover:underline ${tipo === "turno" ? "text-[#378ADD]" : "text-[#1D9E75]"}`}
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
