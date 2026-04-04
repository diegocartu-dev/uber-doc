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
      <button onClick={toggle} className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors">
        {abierto ? "Cerrar historial ×" : "Ver historial →"}
      </button>

      {abierto && (
        <div className="mt-3 max-h-[280px] overflow-y-auto rounded-lg" style={{ border: "0.5px solid #e5e7eb" }}>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-gray-400">
              {cargado ? (tipo === "turno" ? "Sin turnos completados" : "Sin consultas completadas") : "Cargando..."}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.paciente_nombre}</p>
                    <p className="text-xs text-gray-400">{item.fecha}</p>
                  </div>
                  <a
                    href={item.url}
                    className="shrink-0 text-xs font-medium text-[#1D9E75] hover:underline"
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
