"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Calendar, Zap } from "lucide-react";

interface Fila {
  iso: string;
  label: string;
  esHoy: boolean;
}
interface Serie {
  filas: Fila[];
  matriz: number[][];
}
interface Data {
  hoy: string;
  dias: number;
  ci: Serie;
  turnos: Serie;
  hayDatosCI: boolean;
  totalMedicoHorasCI: number;
  medicosConAgenda: number;
}

const HORAS = Array.from({ length: 24 }, (_, h) => h);

function Heatmap({
  serie,
  rgb,
  unidad,
  scrollToToday,
}: {
  serie: Serie;
  rgb: string;
  unidad: string;
  scrollToToday?: boolean;
}) {
  const max = Math.max(1, ...serie.matriz.flat());
  const hoyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollToToday && hoyRef.current) {
      hoyRef.current.scrollIntoView({ block: "center" });
    }
  }, [scrollToToday, serie]);

  return (
    <div className="max-h-[440px] overflow-auto rounded-lg">
      <div className="min-w-[760px]">
        {/* header de horas (sticky) */}
        <div className="sticky top-0 z-10 flex bg-[#1E293B] pb-1">
          <div className="w-16 shrink-0" />
          {HORAS.map((h) => (
            <div key={h} className="flex-1 text-center text-[9px] text-white/30">
              {h % 2 === 0 ? String(h).padStart(2, "0") : ""}
            </div>
          ))}
        </div>
        {serie.filas.map((fila, d) => (
          <div
            key={fila.iso}
            ref={fila.esHoy ? hoyRef : undefined}
            className={`mt-px flex items-center rounded ${fila.esHoy ? "bg-[#378ADD]/10 ring-1 ring-inset ring-[#378ADD]/40" : ""}`}
          >
            <div
              className={`w-16 shrink-0 pl-1 text-[10px] ${
                fila.esHoy ? "font-bold text-[#378ADD]" : "font-medium text-white/45"
              }`}
            >
              {fila.esHoy ? "Hoy" : fila.label}
            </div>
            {serie.matriz[d].map((v, h) => (
              <div key={h} className="flex-1 px-px">
                <div
                  title={`${fila.label} ${String(h).padStart(2, "0")}:00 — ${v} ${unidad}`}
                  className="flex h-5 items-center justify-center rounded-[2px] text-[8px] font-semibold text-white"
                  style={{ background: v === 0 ? "rgba(255,255,255,0.03)" : `rgba(${rgb},${0.18 + 0.82 * (v / max)})` }}
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
  const [dias, setDias] = useState(7);

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
            Cuánta atención hay disponible cada día y franja, para analizar la oferta y decidir acciones.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-white/30">CI hacia atrás:</span>
          {[7, 14, 30].map((d) => (
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
          {/* Turnos programados: 7 días atrás · hoy · 30 adelante */}
          <section className="rounded-xl border border-white/10 bg-[#1E293B] p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Calendar size={16} color="#378ADD" />
              <h2 className="text-sm font-semibold text-white">Turnos programados habilitados</h2>
              <span className="text-xs text-white/40">
                médicos con agenda abierta · 7 días atrás · hoy · 30 adelante · {data.medicosConAgenda} con agenda
              </span>
            </div>
            <Heatmap serie={data.turnos} rgb="55,138,221" unidad="médico(s)" scrollToToday />
          </section>

          {/* CI ofertada: hoy y días hacia atrás */}
          <section className="rounded-xl border border-white/10 bg-[#1E293B] p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Zap size={16} color="#1D9E75" />
              <h2 className="text-sm font-semibold text-white">Consulta Inmediata ofertada</h2>
              <span className="text-xs text-white/40">
                médico-horas de CI · hoy y {data.dias} días hacia atrás · total {data.totalMedicoHorasCI} h
              </span>
            </div>
            {data.hayDatosCI ? (
              <Heatmap serie={data.ci} rgb="29,158,117" unidad="médico-horas" />
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/40">
                Todavía no hay datos de disponibilidad de CI. Se registran desde ahora — en unos días vas a ver acá las
                médico-horas de CI por día y franja.
              </div>
            )}
          </section>

          <p className="text-center text-[11px] text-white/25">
            Cada celda es una franja de 1 hora (hora de Argentina). La fila <span className="text-[#378ADD]">Hoy</span>{" "}
            está resaltada. Turnos: médicos con agenda abierta esa fecha. CI: médico-horas de disponibilidad (3 médicos
            disponibles de 10 a 11 = 3 médico-horas).
          </p>
        </>
      )}
    </div>
  );
}
