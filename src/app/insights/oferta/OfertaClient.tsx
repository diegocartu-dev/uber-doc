"use client";

import { useState, useEffect } from "react";
import { Loader2, Calendar, Zap } from "lucide-react";

interface Data {
  dias: number;
  desde: string;
  diasNombres: string[];
  turnos: number[][];
  ci: number[][];
  hayDatosCI: boolean;
  totalMedicoHorasCI: number;
  medicosConAgenda: number;
}

const HORAS = Array.from({ length: 24 }, (_, h) => h);

function Heatmap({
  matriz,
  dias,
  rgb,
  unidad,
}: {
  matriz: number[][];
  dias: string[];
  rgb: string;
  unidad: string;
}) {
  const max = Math.max(1, ...matriz.flat());
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        {/* header de horas */}
        <div className="flex">
          <div className="w-9 shrink-0" />
          {HORAS.map((h) => (
            <div key={h} className="flex-1 text-center text-[9px] text-white/30">
              {h % 2 === 0 ? String(h).padStart(2, "0") : ""}
            </div>
          ))}
        </div>
        {matriz.map((fila, d) => (
          <div key={d} className="mt-px flex items-center">
            <div className="w-9 shrink-0 text-[11px] font-medium text-white/50">{dias[d]}</div>
            {fila.map((v, h) => (
              <div key={h} className="flex-1 px-px">
                <div
                  title={`${dias[d]} ${String(h).padStart(2, "0")}:00 — ${v} ${unidad}`}
                  className="flex h-6 items-center justify-center rounded-[3px] text-[9px] font-semibold text-white"
                  style={{
                    background: v === 0 ? "rgba(255,255,255,0.03)" : `rgba(${rgb},${0.18 + 0.82 * (v / max)})`,
                  }}
                >
                  {v > 0 ? v : ""}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OfertaClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/insights/oferta?dias=${dias}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [dias]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Oferta por horario</h1>
          <p className="text-sm text-white/50">
            Cuánta atención hay disponible en cada franja, para analizar la oferta y decidir acciones.
          </p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                dias === d ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-white/30" />
        </div>
      ) : (
        <>
          {/* Turnos programados habilitados */}
          <section className="rounded-xl border border-white/10 bg-[#1E293B] p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Calendar size={16} color="#378ADD" />
              <h2 className="text-sm font-semibold text-white">Turnos programados habilitados</h2>
              <span className="text-xs text-white/40">
                médicos con agenda abierta en cada franja · {data.medicosConAgenda} con agenda cargada
              </span>
            </div>
            <Heatmap matriz={data.turnos} dias={data.diasNombres} rgb="55,138,221" unidad="médico(s)" />
          </section>

          {/* Consulta Inmediata ofertada */}
          <section className="rounded-xl border border-white/10 bg-[#1E293B] p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Zap size={16} color="#1D9E75" />
              <h2 className="text-sm font-semibold text-white">Consulta Inmediata ofertada</h2>
              <span className="text-xs text-white/40">
                médico-horas de CI en los últimos {data.dias} días · total {data.totalMedicoHorasCI} h
              </span>
            </div>
            {data.hayDatosCI ? (
              <Heatmap matriz={data.ci} dias={data.diasNombres} rgb="29,158,117" unidad="médico-horas" />
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/40">
                Todavía no hay datos de disponibilidad de CI.
                <br />
                Se empiezan a registrar desde ahora — en unos días vas a ver acá las médico-horas de CI por franja.
              </div>
            )}
          </section>

          <p className="text-center text-[11px] text-white/25">
            Cada celda es una franja de 1 hora (hora de Argentina). Turnos: cantidad de médicos con agenda abierta.
            CI: suma de médico-horas de disponibilidad (3 médicos disponibles de 10 a 11 = 3 médico-horas).
          </p>
        </>
      )}
    </div>
  );
}
