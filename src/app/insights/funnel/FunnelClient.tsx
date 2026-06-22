"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

interface Funnel {
  entraron: number;
  pagaron: number;
  video: number;
  completaron: number;
  cancelaron: number;
}
interface MedFila {
  medico: string;
  test: boolean;
  pacientes: number;
  consultas: number;
  video: number;
}
interface Data {
  dias: number;
  soloReales: boolean;
  funnel: Funnel;
  demandaPorMedico: MedFila[];
}

const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 100) : 0);

export default function FunnelClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const sp = useSearchParams();
  const real = sp.get("real") !== "0";

  useEffect(() => {
    setLoading(true);
    fetch(`/api/insights/funnel?dias=${dias}&real=${real ? 1 : 0}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [dias, real]);

  const etapas = data
    ? [
        { label: "Entraron (sala de espera)", n: data.funnel.entraron, color: "#378ADD" },
        { label: "Pagaron", n: data.funnel.pagaron, color: "#378ADD" },
        { label: "Entraron al video", n: data.funnel.video, color: "#1D9E75" },
        { label: "Completaron", n: data.funnel.completaron, color: "#1D9E75" },
      ]
    : [];
  const base = data?.funnel.entraron ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Funnel de pacientes</h1>
          <p className="text-sm text-white/50">Qué pasó con los pacientes: entraron, pagaron, entraron al video, completaron — y a qué médico eligieron.</p>
        </div>
        <div className="flex items-center gap-3">
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
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-white/30" />
        </div>
      ) : (
        <>
          {/* Embudo */}
          <section className="rounded-xl border border-white/10 bg-[#1E293B] p-5">
            <h2 className="mb-4 text-sm font-semibold text-white">Recorrido del paciente</h2>
            {base === 0 ? (
              <p className="py-8 text-center text-sm text-white/40">Sin consultas reales en el período.</p>
            ) : (
              <div className="space-y-3">
                {etapas.map((e, i) => {
                  const p = pct(e.n, base);
                  const prev = i > 0 ? etapas[i - 1].n : null;
                  const conv = prev != null && prev > 0 ? pct(e.n, prev) : null;
                  return (
                    <div key={e.label}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-white/80">{e.label}</span>
                        <span className="text-white/50">
                          <span className="font-semibold text-white">{e.n}</span> · {p}%
                          {conv != null && <span className="ml-2 text-[11px] text-white/35">({conv}% del paso anterior)</span>}
                        </span>
                      </div>
                      <div className="h-7 w-full overflow-hidden rounded bg-white/5">
                        <div className="h-full rounded" style={{ width: `${Math.max(p, 2)}%`, background: e.color }} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-2 text-sm">
                  <span className="text-[#E24B4A]">Cancelaron / se cayeron</span>
                  <span className="font-semibold text-[#E24B4A]">{data.funnel.cancelaron} · {pct(data.funnel.cancelaron, base)}%</span>
                </div>
              </div>
            )}
          </section>

          {/* Demanda por médico */}
          <section className="rounded-xl border border-white/10 bg-[#1E293B] p-5">
            <h2 className="mb-1 text-sm font-semibold text-white">¿A qué médico eligieron?</h2>
            <p className="mb-4 text-xs text-white/40">Cuántos pacientes distintos eligieron a cada médico (y cuántos llegaron al video).</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/40">
                    <th className="py-2 pr-3 font-medium">Médico</th>
                    <th className="px-3 py-2 font-medium">Pacientes</th>
                    <th className="px-3 py-2 font-medium">Consultas (total)</th>
                    <th className="px-3 py-2 font-medium">Llegaron al video</th>
                  </tr>
                </thead>
                <tbody>
                  {data.demandaPorMedico.length === 0 && (
                    <tr><td colSpan={4} className="py-8 text-center text-white/40">Sin datos en el período.</td></tr>
                  )}
                  {data.demandaPorMedico.map((m, i) => (
                    <tr key={i} className="border-b border-white/5 last:border-0">
                      <td className="py-2.5 pr-3 text-white/90">
                        {m.medico}
                        {m.test && <span className="ml-2 rounded bg-[#BA7517]/20 px-1.5 py-0.5 text-[10px] text-[#BA7517]">test</span>}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-white">{m.pacientes}</td>
                      <td className="px-3 py-2.5 text-white/70">{m.consultas}</td>
                      <td className="px-3 py-2.5 text-white/70">
                        {m.video} <span className="text-white/35">({pct(m.video, m.consultas)}%)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-center text-[11px] text-white/25">
            "Entró al video" se usa como señal de que el médico aceptó (el momento exacto de aceptación no se registra hoy). El recorrido se mide combinando estado + pago + timestamps.
          </p>
        </>
      )}
    </div>
  );
}
