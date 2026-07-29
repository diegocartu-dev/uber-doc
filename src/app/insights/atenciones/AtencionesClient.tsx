"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

interface Cobro {
  pagado: boolean;
  monto: number | null;
}
interface Atencion {
  cuando: string;
  tipo: "CI" | "Turno";
  canal: "clinica_virtual" | "consultorio_privado" | null;
  medico: string;
  paciente: string;
  provincia: string | null;
  estado: string;
  estadoLabel: string;
  atendida: boolean;
  duracionMin: number | null;
  cobro: Cobro | null;
  docs: string[];
}
interface Data {
  dias: number;
  atenciones: Atencion[];
  resumen: { total: number; atendidas: number; cobradas: number; conDoc: number };
}

const fmtMonto = (n: number | null) => (n == null ? "" : "$" + n.toLocaleString("es-AR"));

const ESTADO_COLOR: Record<string, string> = {
  completada: "#1D9E75",
  completado: "#1D9E75",
  en_curso: "#378ADD",
  confirmado: "#378ADD",
  esperando: "#BA7517",
  cancelada: "#E24B4A",
  cancelado_paciente: "#E24B4A",
  cancelado_medico: "#E24B4A",
};

export default function AtencionesClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const sp = useSearchParams();
  const real = sp.get("real") !== "0";

  useEffect(() => {
    setLoading(true);
    fetch(`/api/insights/atenciones?dias=${dias}&real=${real ? 1 : 0}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [dias, real]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Atenciones</h1>
          <p className="text-sm text-white/50">
            Qué pasó en cada atención real: a quién atendió, si documentó, si cobró y cuánto duró.
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: "Atenciones", v: data.resumen.total },
              { l: "Atendidas", v: data.resumen.atendidas },
              { l: "Cobradas", v: data.resumen.cobradas },
              { l: "Con documento", v: data.resumen.conDoc },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-white/10 bg-[#1E293B] p-4">
                <div className="text-2xl font-bold text-white">{k.v}</div>
                <div className="text-xs text-white/40">{k.l}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#1E293B]">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/40">
                  <th className="px-4 py-3 font-medium">Cuándo</th>
                  <th className="px-3 py-3 font-medium">Tipo</th>
                  <th className="px-3 py-3 font-medium">Médico</th>
                  <th className="px-3 py-3 font-medium">Paciente</th>
                  <th className="px-3 py-3 font-medium">Provincia</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Duró</th>
                  <th className="px-3 py-3 font-medium">Documentó</th>
                  <th className="px-3 py-3 font-medium">Cobró</th>
                </tr>
              </thead>
              <tbody>
                {data.atenciones.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-white/40">
                      Sin atenciones en el período.
                    </td>
                  </tr>
                )}
                {data.atenciones.map((a, i) => {
                  const ec = ESTADO_COLOR[a.estado] ?? "#888780";
                  // Tres categorías (Diego 28/07): CI azul, turno clínica gris,
                  // turno consultorio particular ámbar. Verde es solo para estados.
                  const esConsultorio = a.tipo === "Turno" && a.canal === "consultorio_privado";
                  const tc = a.tipo === "CI" ? "#378ADD" : esConsultorio ? "#BA7517" : "#888780";
                  const tipoLabel = a.tipo === "CI" ? "CI" : esConsultorio ? "Turno consult." : "Turno clínica";
                  return (
                    <tr key={i} className="border-b border-white/5 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-white/70">{a.cuando}</td>
                      <td className="px-3 py-3">
                        <span className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: tc + "22", color: tc }}>
                          {tipoLabel}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-white/90">{a.medico}</td>
                      <td className="px-3 py-3 text-white/90">{a.paciente}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-white/70">
                        {a.provincia ?? <span className="text-white/25">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: ec + "22", color: ec }}>
                          {a.estadoLabel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-white/70">
                        {a.duracionMin != null ? `${a.duracionMin} min` : <span className="text-white/25">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        {a.docs.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {a.docs.map((d) => (
                              <span key={d} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">
                                {d}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-white/25">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {a.cobro?.pagado ? (
                          <span className="font-semibold text-[#1D9E75]">{fmtMonto(a.cobro.monto)}</span>
                        ) : a.cobro ? (
                          <span className="text-[#BA7517]">Pendiente</span>
                        ) : (
                          <span className="text-white/25">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-center text-[11px] text-white/25">
            Solo atenciones reales (no incluye los slots libres de agenda). Duración: del inicio al cierre de la consulta;
            "—" cuando el cierre no quedó registrado (se está mejorando).
          </p>
        </>
      )}
    </div>
  );
}
