"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

interface Busqueda {
  cuando: number;
  paciente: string;
  provincia: string | null;
  vistas: number;
  medicosProvincia: number;
  ciOnline: number;
  exacto: boolean;
  resultado: string;
  matchHabia: boolean;
}

interface Data {
  dias: number;
  etapas: { busquedas: number; eligieron: number; pagaron: number; seAtendieron: number; sinMatch: number };
  porProvincia: { provincia: string; busquedas: number; sinMatch: number; medicosHoy: number }[];
  busquedas: Busqueda[];
}

const RESULTADO_COLOR: Record<string, string> = {
  "se atendió": "#1D9E75",
  "pagó": "#1D9E75",
  "eligió médico, no pagó": "#BA7517",
  "había oferta, no eligió": "#888780",
  "eligió, nadie lo aceptó": "#D85A30",
  "había médicos pero ninguno en línea": "#D85A30",
  "sin médicos para su provincia": "#E24B4A",
  "sin provincia cargada": "#888780",
};

function horaDe(ms: number) {
  return new Date(ms).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "America/Argentina/Buenos_Aires",
  });
}

export default function FunnelClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const sp = useSearchParams();
  const real = sp.get("real") !== "0";

  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/insights/funnel?dias=${dias}&real=${real ? 1 : 0}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [dias, real]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Demanda</h1>
          <p className="text-sm text-white/50">
            Quién buscó atención, cuándo, y si el match estaba: cuánta oferta había para su provincia en ese momento.
          </p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                dias === d ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-white/10 bg-[#1E293B] p-12 text-center">
          <p className="text-sm text-white/50">No se pudieron cargar los datos.</p>
          <button onClick={() => window.location.reload()} className="mt-3 rounded-lg bg-white/10 px-4 py-1.5 text-xs text-white hover:bg-white/20">
            Reintentar
          </button>
        </div>
      ) : loading || !data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-white/30" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { l: "Búsquedas", v: data.etapas.busquedas, c: "text-white" },
              { l: "Eligieron médico", v: data.etapas.eligieron, c: "text-white" },
              { l: "Pagaron", v: data.etapas.pagaron, c: "text-white" },
              { l: "Se atendieron", v: data.etapas.seAtendieron, c: "text-[#1D9E75]" },
              { l: "Sin match", v: data.etapas.sinMatch, c: data.etapas.sinMatch > 0 ? "text-[#E24B4A]" : "text-white/40" },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-white/10 bg-[#1E293B] p-4">
                <div className={`text-2xl font-bold ${k.c}`}>{k.v}</div>
                <div className="text-xs text-white/40">{k.l}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#1E293B] p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/30">Demanda por provincia</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.porProvincia.map((p) => (
                <div
                  key={p.provincia}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    p.sinMatch > 0 ? "border-[#E24B4A]/40 bg-[#E24B4A]/10" : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <span className="font-medium text-white/80">{p.provincia}</span>
                  <span className="ml-2 text-white/50">{p.busquedas} búsq.</span>
                  <span className="ml-2 text-white/35">{p.medicosHoy} méd. hoy</span>
                  {p.sinMatch > 0 && <span className="ml-2 font-medium text-[#E24B4A]">{p.sinMatch} sin match</span>}
                </div>
              ))}
              {data.porProvincia.length === 0 && <p className="text-xs text-white/30">Sin búsquedas en el período.</p>}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#1E293B]">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/40">
                  <th className="px-4 py-3 font-medium">Cuándo</th>
                  <th className="px-3 py-3 font-medium">Paciente</th>
                  <th className="px-3 py-3 font-medium">Provincia</th>
                  <th className="px-3 py-3 font-medium" title="Médicos habilitados para su provincia en ese momento">Méd. p/su prov.</th>
                  <th className="px-3 py-3 font-medium" title="De esos, cuántos estaban EN LÍNEA para consulta inmediata en ese instante">CI en línea</th>
                  <th className="px-3 py-3 font-medium">Qué pasó</th>
                </tr>
              </thead>
              <tbody>
                {data.busquedas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-white/40">Sin búsquedas en el período.</td>
                  </tr>
                )}
                {data.busquedas.map((b, i) => {
                  const c = RESULTADO_COLOR[b.resultado] ?? "#888780";
                  return (
                    <tr key={i} className="border-b border-white/5 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-white/70">
                        {horaDe(b.cuando)}
                        {b.vistas > 1 && <span className="ml-1 text-[10px] text-white/30">×{b.vistas}</span>}
                      </td>
                      <td className="px-3 py-3 text-white/90">{b.paciente}</td>
                      <td className="px-3 py-3 text-white/60">{b.provincia ?? <span className="text-white/25">—</span>}</td>
                      <td className="px-3 py-3 text-white/70">
                        {b.medicosProvincia}
                        {!b.exacto && <span className="ml-0.5 text-white/25" title="Reconstruido con la oferta actual (el evento no guardó la foto)">*</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={b.ciOnline > 0 ? "text-white/70" : "text-[#D85A30]"}>{b.ciOnline}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: c + "22", color: c }}>
                          {b.resultado}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-center text-[11px] text-white/25">
            Una búsqueda = una visita a la clínica (entradas del mismo paciente con menos de 30 min de diferencia cuentan como una).
            "CI en línea" se reconstruye del registro histórico de disponibilidad al instante exacto de la búsqueda.
            * = médicos por provincia estimados con la oferta actual; desde el 28/07 cada búsqueda guarda la foto exacta.
          </p>
        </>
      )}
    </div>
  );
}
