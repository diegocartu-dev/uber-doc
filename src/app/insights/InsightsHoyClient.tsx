"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface HoyData {
  completadasHoy: number;
  totalHoy: number;
  delta: number;
  ciHoy: number;
  turnosHoy: number;
  medicosActivos: number;
  ciEsperando: number;
  gmv: number;
  comisionDocto: number;
  esperaPromMs: number | null;
  retencionPct: number;
  noShowsHoy: number;
  horasDisp: number;
  medicosDispCount: number;
  cancelTardiasCount: number;
  actividad: {
    id: string; tipo: "CI" | "Turno"; estado: string;
    medico: string; paciente: string; especialidad: string;
    precio: number; inicio: string;
  }[];
}

function formatMs(ms: number) {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min} min ${sec} seg`;
}

function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

function salud(metrica: string, valor: number): { label: string; color: string } {
  if (metrica === "espera") {
    if (valor <= 5 * 60 * 1000) return { label: "Excelente", color: "#1D9E75" };
    if (valor <= 15 * 60 * 1000) return { label: "Aceptable", color: "#BA7517" };
    return { label: "Crítico", color: "#D85A30" };
  }
  if (metrica === "retencion") {
    if (valor >= 30) return { label: "Buena", color: "#1D9E75" };
    if (valor >= 15) return { label: "Mejorable", color: "#BA7517" };
    return { label: "Baja", color: "#D85A30" };
  }
  if (metrica === "noshow") {
    if (valor === 0) return { label: "OK", color: "#1D9E75" };
    if (valor <= 2) return { label: "Atención", color: "#BA7517" };
    return { label: "Crítico", color: "#D85A30" };
  }
  return { label: "—", color: "#888780" };
}

export default function InsightsHoyClient() {
  const [data, setData] = useState<HoyData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/insights/hoy");
      const json = await res.json();
      setData(json);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} className="animate-spin text-white/30" />
      </div>
    );
  }

  const esperaSalud = data.esperaPromMs ? salud("espera", data.esperaPromMs) : null;
  const retencionSalud = salud("retencion", data.retencionPct);
  const noshowSalud = salud("noshow", data.noShowsHoy);

  return (
    <div className="space-y-6">
      {/* FILA 1 — Las 3 preguntas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Crecimiento */}
        <div className="rounded-xl bg-[#1E293B] p-6" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">¿Estamos creciendo?</p>
          <p className="mt-3 font-['Space_Grotesk'] text-4xl font-bold text-white">
            {data.completadasHoy}
          </p>
          <p className="mt-1 text-sm text-white/50">consultas completadas hoy</p>
          <div className="mt-3 flex items-center gap-2">
            {data.delta > 0 ? (
              <><TrendingUp size={16} color="#1D9E75" /><span className="text-sm font-medium text-[#1D9E75]">+{data.delta} vs hace 7 días</span></>
            ) : data.delta < 0 ? (
              <><TrendingDown size={16} color="#D85A30" /><span className="text-sm font-medium text-[#D85A30]">{data.delta} vs hace 7 días</span></>
            ) : (
              <><Minus size={16} color="#888780" /><span className="text-sm font-medium text-white/40">igual que hace 7 días</span></>
            )}
          </div>
          <div className="mt-3 flex gap-3 text-xs text-white/40">
            <span>CI: {data.ciHoy}</span>
            <span>Turnos: {data.turnosHoy}</span>
          </div>
        </div>

        {/* Supply vs Demanda */}
        <div className="rounded-xl bg-[#1E293B] p-6" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">¿Supply vs Demanda?</p>
          <p className="mt-3 font-['Space_Grotesk'] text-4xl font-bold text-white">
            {data.medicosActivos}
          </p>
          <p className="mt-1 text-sm text-white/50">médicos activos ahora</p>
          <p className="mt-3 text-sm text-white/40">
            {data.ciEsperando} pacientes en espera CI
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: data.ciEsperando === 0 ? "#1D9E75" : data.ciEsperando <= 3 ? "#BA7517" : "#D85A30" }} />
            <span className="text-sm text-white/50">
              {data.ciEsperando === 0 ? "OK" : data.ciEsperando <= 3 ? "Monitorear" : "Demanda alta"}
            </span>
          </div>
        </div>

        {/* Plata */}
        <div className="rounded-xl bg-[#1E293B] p-6" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">¿La plata cierra?</p>
          <p className="mt-3 font-['Space_Grotesk'] text-4xl font-bold text-white">
            {formatARS(data.gmv)}
          </p>
          <p className="mt-1 text-sm text-white/50">GMV hoy</p>
          <div className="mt-3 rounded-lg bg-[#378ADD]/10 px-3 py-2">
            <p className="text-sm font-medium text-[#378ADD]">
              Docto {formatARS(data.comisionDocto)}
            </p>
            <p className="text-xs text-[#378ADD]/60">comisión 5%</p>
          </div>
        </div>
      </div>

      {/* FILA 2 — 5 métricas de Elena */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricSmall
          label="Espera prom. CI"
          value={data.esperaPromMs ? formatMs(data.esperaPromMs) : "Sin datos"}
          salud={esperaSalud}
        />
        <MetricSmall
          label="Retención"
          value={`${data.retencionPct}% vuelven`}
          salud={retencionSalud}
        />
        <MetricSmall
          label="No-show médicos"
          value={`${data.noShowsHoy} hoy`}
          salud={noshowSalud}
        />
        <MetricSmall
          label="Hs médicos CI"
          value={`${data.horasDisp} hs`}
          sub={`${data.medicosDispCount} médicos`}
        />
        <MetricSmall
          label="Cancel. tardías"
          value={`${data.cancelTardiasCount} esta semana`}
        />
      </div>

      {/* FILA 3 — Actividad reciente */}
      <div className="rounded-xl bg-[#1E293B]" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="border-b border-white/5 px-5 py-4">
          <h2 className="text-sm font-semibold text-white/80">Actividad del día</h2>
        </div>
        {data.actividad.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/30">Sin actividad hoy</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-white/30">
                  <th className="px-5 py-3">Médico</th>
                  <th className="px-5 py-3">Paciente</th>
                  <th className="hidden px-5 py-3 lg:table-cell">Especialidad</th>
                  <th className="px-5 py-3">Canal</th>
                  <th className="px-5 py-3">Precio</th>
                  <th className="hidden px-5 py-3 lg:table-cell">Comisión</th>
                  <th className="px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.actividad.map((a) => (
                  <tr key={`${a.tipo}-${a.id}`} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3 font-medium text-white/90">{a.medico}</td>
                    <td className="px-5 py-3 text-white/60">{a.paciente}</td>
                    <td className="hidden px-5 py-3 text-white/40 lg:table-cell">{a.especialidad || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        a.tipo === "CI" ? "bg-[#378ADD]/20 text-[#378ADD]" : "bg-purple-500/20 text-purple-400"
                      }`}>
                        {a.tipo}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-white/70">{formatARS(a.precio)}</td>
                    <td className="hidden px-5 py-3 text-[#378ADD]/80 lg:table-cell">{formatARS(a.precio * 0.05)}</td>
                    <td className="px-5 py-3">
                      <EstadoBadge estado={a.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricSmall({ label, value, salud, sub }: {
  label: string; value: string; salud?: { label: string; color: string } | null; sub?: string;
}) {
  return (
    <div className="rounded-xl bg-[#1E293B] p-4" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/30">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      {salud && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: salud.color }} />
          <span className="text-xs" style={{ color: salud.color }}>{salud.label}</span>
        </div>
      )}
      {sub && <p className="mt-1 text-xs text-white/30">{sub}</p>}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const styles: Record<string, string> = {
    completada: "bg-[#1D9E75]/20 text-[#1D9E75]",
    completado: "bg-[#1D9E75]/20 text-[#1D9E75]",
    en_curso: "bg-[#378ADD]/20 text-[#378ADD]",
    esperando: "bg-[#BA7517]/20 text-[#BA7517]",
    cancelada: "bg-[#E24B4A]/20 text-[#E24B4A]",
    cancelado: "bg-[#E24B4A]/20 text-[#E24B4A]",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[estado] ?? "bg-white/10 text-white/50"}`}>
      {estado}
    </span>
  );
}
