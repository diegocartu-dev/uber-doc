"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
  medicosConConsultorio: number;
  medicosOferta: { nombre: string; especialidad: string; ciHoras: number; turnos: boolean }[];
  medicosRegistrados: number;
  especialidadesConOferta: number;
  especialidadesSinOferta: { especialidad: string; medicos: number }[];
}

const HORAS = Array.from({ length: 24 }, (_, h) => h);

function Heatmap({
  serie,
  rgb,
  unidad,
  hoyIso,
  scrollToToday,
}: {
  serie: Serie;
  rgb: string;
  unidad: string;
  hoyIso: string;
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
        {serie.filas.map((fila, d) => {
          const esPasado = fila.iso < hoyIso; // ya ocurrió (inmutable) → atenuado
          return (
          <div
            key={fila.iso}
            ref={fila.esHoy ? hoyRef : undefined}
            className={`mt-px flex items-center rounded ${fila.esHoy ? "border-b-2 border-[#378ADD]/50 bg-[#378ADD]/10 ring-1 ring-inset ring-[#378ADD]/40" : ""} ${esPasado ? "opacity-50" : ""}`}
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
          );
        })}
      </div>
    </div>
  );
}

// Color de la brecha de activación por % de médicos ofertando (semáforo de estado).
function gapColor(ofertando: number, total: number): string {
  if (total === 0) return "#888780";
  const pct = ofertando / total;
  return pct >= 0.7 ? "#1D9E75" : pct >= 0.3 ? "#BA7517" : "#D85A30";
}

export default function OfertaClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(7);
  const sp = useSearchParams();
  const real = sp.get("real") !== "0";

  useEffect(() => {
    setLoading(true);
    fetch(`/api/insights/oferta?dias=${dias}&real=${real ? 1 : 0}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [dias, real]);

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
          {/* Resumen de identidad: quién oferta + cobertura por especialidad */}
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-[#1E293B] p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-white/40">Quién oferta</p>
              <p className="mt-3 font-['Space_Grotesk'] text-4xl font-bold" style={{ color: gapColor(data.medicosOferta.length, data.medicosRegistrados) }}>
                {data.medicosRegistrados - data.medicosOferta.length}<span className="text-2xl text-white/30"> de {data.medicosRegistrados}</span>
              </p>
              <p className="mt-1 text-sm text-white/50">médicos sin oferta activa</p>
              {data.medicosOferta.length > 0 && (
                <div className="mt-3 divide-y divide-white/5 border-t border-white/10 pt-1">
                  {data.medicosOferta.map((m, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white/90">{m.nombre}</p>
                        <p className="truncate text-xs text-white/40">{m.especialidad}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {m.turnos && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/60">Turnos</span>}
                        {m.ciHoras > 0 && <span className="rounded bg-[#378ADD]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#378ADD]">CI {m.ciHoras}h</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-[#1E293B] p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wider text-white/40">Cobertura por especialidad</p>
                <span className="shrink-0 text-xs text-white/40">{data.especialidadesConOferta} con oferta</span>
              </div>
              {data.especialidadesSinOferta.length === 0 ? (
                <p className="text-sm text-white/40">Todas las especialidades con médicos registrados tienen oferta.</p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-white/40">Con médicos registrados pero <span className="text-[#D85A30]">sin oferta</span>:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.especialidadesSinOferta.map((e) => (
                      <span key={e.especialidad} className="rounded-lg border border-[#D85A30]/30 bg-[#D85A30]/10 px-2 py-1 text-xs text-white/80">
                        {e.especialidad} <span className="text-white/40">· {e.medicos} méd.</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Turnos programados: 7 días atrás · hoy · 30 adelante */}
          <section className="rounded-xl border border-white/10 bg-[#1E293B] p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Calendar size={16} color="#378ADD" />
              <h2 className="text-sm font-semibold text-white">Turnos programados habilitados (clínica virtual)</h2>
              <span className="text-xs text-white/40">
                {data.medicosConAgenda} con agenda · 7 días atrás · hoy · 30 adelante
                {data.medicosConConsultorio > 0 && ` · consultorio particular: ${data.medicosConConsultorio} médico${data.medicosConConsultorio !== 1 ? "s" : ""} (aparte)`}
              </span>
            </div>
            <p className="mb-2 text-[11px] text-white/35">
              Cada celda = una franja de 1 h. El número es cuántos médicos tienen agenda abierta esa hora. Bajo la línea
              de <span className="text-[#378ADD]">Hoy</span> es proyección; lo de arriba (atenuado) ya pasó.
            </p>
            <Heatmap serie={data.turnos} rgb="55,138,221" unidad="médico(s)" hoyIso={data.hoy} scrollToToday />
          </section>

          {/* CI ofertada: hoy y días hacia atrás */}
          <section className="rounded-xl border border-white/10 bg-[#1E293B] p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Zap size={16} color="#1D9E75" />
              <h2 className="text-sm font-semibold text-white">Consulta Inmediata ofertada</h2>
              <span className="text-xs text-white/40">
                total {data.totalMedicoHorasCI} médico-horas · hoy y {data.dias} días hacia atrás
              </span>
            </div>
            <p className="mb-2 text-[11px] text-white/35">
              Cada celda = médico-horas de disponibilidad de CI en esa franja (3 médicos disponibles de 10 a 11 = 3
              médico-horas). <span className="text-[#378ADD]">Hoy</span> arriba; abajo (atenuado), los días previos.
            </p>
            {data.hayDatosCI ? (
              <Heatmap serie={data.ci} rgb="29,158,117" unidad="médico-horas" hoyIso={data.hoy} />
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/40">
                Todavía no hay datos de disponibilidad de CI. Se registran desde ahora — en unos días vas a ver acá las
                médico-horas de CI por día y franja.
              </div>
            )}
          </section>

          <p className="text-center text-[11px] text-white/25">
            Horarios en hora de Argentina (UTC−3).
          </p>
        </>
      )}
    </div>
  );
}
