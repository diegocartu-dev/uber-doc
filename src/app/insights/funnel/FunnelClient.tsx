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
interface Etapa {
  etapa: string;
  n: number;
  nuevo: boolean;
  pct: number;
  pctPaso: number | null;
}
interface Data {
  dias: number;
  soloReales: boolean;
  recorrido: Etapa[];
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

  const recorrido = data?.recorrido ?? [];
  const registro = recorrido[0]?.n ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Funnel de pacientes</h1>
          <p className="text-sm text-white/50">El recorrido completo: de cuántos se registran, cuántos llegan a cada paso hasta atenderse.</p>
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
          {/* Recorrido completo del paciente */}
          <section className="rounded-xl border border-white/10 bg-[#1E293B] p-5">
            <h2 className="mb-1 text-sm font-semibold text-white">Recorrido del paciente</h2>
            <p className="mb-4 text-xs text-white/40">
              Pacientes distintos que llegan a cada paso. El % es sobre los que se registraron.
            </p>
            {registro === 0 ? (
              <p className="py-8 text-center text-sm text-white/40">Sin registros reales en el período.</p>
            ) : (
              <div className="space-y-3">
                {recorrido.map((e, i) => {
                  const esFinal = i === recorrido.length - 1;
                  const color = esFinal ? "#1D9E75" : "#378ADD";
                  return (
                    <div key={e.etapa}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-white/80">
                          {e.etapa}
                          {e.nuevo && (
                            <span className="ml-2 text-[10px] text-white/30">midiendo desde 22/06</span>
                          )}
                        </span>
                        <span className="text-white/50">
                          <span className="font-semibold text-white">{e.n}</span> · {e.pct}%
                          {e.pctPaso != null && <span className="ml-2 text-[11px] text-white/35">({e.pctPaso}% del paso anterior)</span>}
                        </span>
                      </div>
                      <div className="h-7 w-full overflow-hidden rounded bg-white/5">
                        <div className="h-full rounded" style={{ width: `${Math.max(e.pct, 2)}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-2 text-sm">
                  <span className="text-[#E24B4A]">Cancelaron / se cayeron (de las consultas)</span>
                  <span className="font-semibold text-[#E24B4A]">{data.funnel.cancelaron}</span>
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
            "Entró a la clínica" y "Eligió un médico" se empezaron a medir el 22/06 — para períodos anteriores dan 0 aunque haya habido visitas (antes no se registraban). De acá en adelante se llenan con cada paciente que entra.
          </p>
        </>
      )}
    </div>
  );
}
