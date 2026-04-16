"use client";

import { useState, useEffect, useTransition } from "react";
import { fetchMetricasMedico } from "./actions";

type Metricas = { turnos: number; enEspera: number; completadas: number; ingresos: number };
type Periodo = "hoy" | "semana" | "mes";

export default function MetricasMedico({
  medicoId,
  inicial,
}: {
  medicoId: string;
  inicial: Metricas;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const [metricas, setMetricas] = useState(inicial);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMetricas(inicial);
    setPeriodo("hoy");
  }, [inicial.turnos, inicial.enEspera, inicial.completadas, inicial.ingresos]);

  function cambiar(p: Periodo) {
    if (p === periodo) return;
    setPeriodo(p);
    startTransition(async () => {
      const data = await fetchMetricasMedico(medicoId, p);
      setMetricas(data);
    });
  }

  const items = [
    { label: "Ingresos", value: `$${metricas.ingresos.toLocaleString("es-AR")}`, color: "#378ADD" },
    { label: "Completadas", value: metricas.completadas, color: "#888780" },
    { label: "En espera", value: metricas.enEspera, color: metricas.enEspera > 0 ? "#D85A30" : "#888780" },
    { label: "Turnos", value: metricas.turnos, color: "#378ADD" },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium tracking-wide text-gray-500">MÉTRICAS</p>
        <div className="inline-flex gap-0.5 rounded-lg bg-gray-100 p-0.5">
          {(["hoy", "semana", "mes"] as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => cambiar(p)}
              className={`rounded-md px-3.5 py-2 text-xs font-medium transition-all ${
                periodo === p
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {p === "hoy" ? "Hoy" : p === "semana" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>
      <div className={`grid grid-cols-2 gap-3 lg:grid-cols-4 transition-opacity ${isPending ? "opacity-50" : ""}`}>
        {items.map((m) => (
          <div key={m.label} className="rounded-xl bg-white p-4 min-h-[80px]" style={{ border: "0.5px solid #e5e7eb" }}>
            <p className="text-[11px] font-medium tracking-wide text-gray-400">{m.label.toUpperCase()}</p>
            <p className="mt-1.5 text-2xl font-semibold" style={{ color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
