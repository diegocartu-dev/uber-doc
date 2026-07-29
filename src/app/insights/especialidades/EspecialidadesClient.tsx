"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

interface MedicoDeEsp {
  nombre: string;
  jurisdicciones: string[];
  disponible: boolean;
}

interface EspStat {
  especialidad: string;
  total: number;
  atendidas: number;
  totalCI: number;
  totalTurnoClinica: number;
  totalTurnoConsultorio: number;
  cobrado: number;
  medicosActivos: number;
  medicosTotal: number;
  medicos: MedicoDeEsp[];
  demanda: "alta" | "media" | "ok";
  atencionesPorMedicoActivo: number | null;
  sinMedicos: boolean;
}

function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

const demandaStyles = {
  alta: { bg: "bg-[#D85A30]/20", text: "text-[#D85A30]", label: "Alta" },
  media: { bg: "bg-[#BA7517]/20", text: "text-[#BA7517]", label: "Media" },
  ok: { bg: "bg-[#1D9E75]/20", text: "text-[#1D9E75]", label: "OK" },
};

export default function EspecialidadesClient() {
  const [data, setData] = useState<EspStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const sp = useSearchParams();
  const real = sp.get("real") !== "0";

  useEffect(() => {
    setLoading(true);
    fetch(`/api/insights/especialidades?dias=${dias}&real=${real ? 1 : 0}`)
      .then(r => r.json())
      .then(d => setData(d.especialidades ?? []))
      .finally(() => setLoading(false));
  }, [dias, real]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Especialidades</h1>
        <div className="flex gap-1">
          {[7, 30, 90].map(d => (
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

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-white/30" />
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-xl bg-[#1E293B] p-12 text-center" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-sm text-white/30">Sin especialidades con médicos todavía</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map(esp => {
            const d = demandaStyles[esp.demanda];
            const convRate = esp.total > 0 ? Math.round((esp.atendidas / esp.total) * 100) : 0;
            return (
              <div
                key={esp.especialidad}
                className="flex flex-col rounded-xl bg-[#1E293B] p-5"
                style={{ border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-base font-semibold text-white">{esp.especialidad}</h3>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${d.bg} ${d.text}`}
                    title="Demanda vs oferta: cuántas atenciones llegan por cada médico activo. Alta = conviene reclutar."
                  >
                    {d.label}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-white/35">
                  {esp.sinMedicos
                    ? "⚠ Hay demanda y 0 médicos activos — reclutar"
                    : esp.atencionesPorMedicoActivo != null
                      ? `${esp.atencionesPorMedicoActivo} atenciones por médico activo`
                      : "Sin actividad en el período"}
                </p>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-white/30">Total</p>
                    <p className="mt-1 text-lg font-semibold text-white">{esp.total}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-white/30">Atendidas</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {esp.atendidas}
                      <span className="ml-1 text-sm font-normal text-white/40">({convRate}%)</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-white/30">Cobrado</p>
                    <p className="mt-1 text-lg font-semibold text-white">{formatARS(esp.cobrado)}</p>
                  </div>
                </div>

                {esp.total > 0 && (
                  <p className="mt-2 text-[11px] text-white/35">
                    {esp.totalCI} CI · {esp.totalTurnoClinica} turnos clínica · {esp.totalTurnoConsultorio} consultorio
                  </p>
                )}

                {/* Qué médicos la componen y de qué provincias (directiva Diego 28/07) */}
                <div className="mt-4 flex-1 space-y-1.5 rounded-lg bg-white/[0.03] px-3 py-2.5">
                  {esp.medicos.length === 0 ? (
                    <p className="text-xs text-white/30">Sin médicos en esta especialidad</p>
                  ) : (
                    esp.medicos.map(m => (
                      <div key={m.nombre} className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 text-white/70">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.disponible ? "bg-[#1D9E75]" : "bg-white/20"}`} />
                          {m.nombre}
                        </span>
                        <span className="shrink-0 text-right text-white/35">
                          {m.jurisdicciones.length > 0 ? m.jurisdicciones.join(", ") : "—"}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 flex items-center gap-3 px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#1D9E75]" />
                    <span className="text-xs text-white/50">{esp.medicosActivos} activos</span>
                  </div>
                  <span className="text-white/10">|</span>
                  <span className="text-xs text-white/30">{esp.medicosTotal} total</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-center text-[11px] text-white/25">
        Total y Atendidas incluyen consultas inmediatas y turnos. Cobrado = pagos aprobados en Mercado Pago del período (excluye reembolsos). Punto verde = disponible ahora.
      </p>
    </div>
  );
}
