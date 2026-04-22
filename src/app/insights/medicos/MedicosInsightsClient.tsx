"use client";

import { useState, useEffect } from "react";
import { Loader2, ArrowUpDown } from "lucide-react";

interface MedicoStat {
  id: string;
  nombre: string;
  especialidad: string;
  disponible: boolean;
  consultas: number;
  canceladas: number;
  noShows: number;
  gmv: number;
  comision: number;
  esperaPromMs: number | null;
  retencion: number;
  ultimaActividad: string | null;
}

type SortKey = "nombre" | "consultas" | "gmv" | "canceladas" | "noShows" | "retencion";

function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

function formatMs(ms: number) {
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

export default function MedicosInsightsClient() {
  const [medicos, setMedicos] = useState<MedicoStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const [sortKey, setSortKey] = useState<SortKey>("gmv");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/insights/medicos?dias=${dias}`)
      .then(r => r.json())
      .then(d => setMedicos(d.medicos ?? []))
      .finally(() => setLoading(false));
  }, [dias]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = [...medicos].sort((a, b) => {
    const va = a[sortKey] ?? 0;
    const vb = b[sortKey] ?? 0;
    if (typeof va === "string") return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Médicos</h1>
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
      ) : (
        <div className="overflow-hidden rounded-xl bg-[#1E293B]" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-white/30">
                  <SortHeader label="Médico" sortKey="nombre" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <th className="hidden px-4 py-3 md:table-cell">Especialidad</th>
                  <SortHeader label="Consultas" sortKey="consultas" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <SortHeader label="GMV" sortKey="gmv" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <th className="hidden px-4 py-3 lg:table-cell">Comisión</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Espera CI</th>
                  <SortHeader label="No-shows" sortKey="noShows" current={sortKey} asc={sortAsc} onClick={toggleSort} className="hidden md:table-cell" />
                  <SortHeader label="Cancel." sortKey="canceladas" current={sortKey} asc={sortAsc} onClick={toggleSort} className="hidden md:table-cell" />
                  <SortHeader label="Retención" sortKey="retencion" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <th className="hidden px-4 py-3 lg:table-cell">Última act.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sorted.map(m => (
                  <tr key={m.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${m.disponible ? "bg-[#1D9E75]" : "bg-white/20"}`} />
                        <span className="font-medium text-white/90">{m.nombre}</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-white/50 md:table-cell">{m.especialidad}</td>
                    <td className="px-4 py-3 text-white/70">{m.consultas}</td>
                    <td className="px-4 py-3 font-medium text-white/90">{formatARS(m.gmv)}</td>
                    <td className="hidden px-4 py-3 text-[#378ADD] lg:table-cell">{formatARS(m.comision)}</td>
                    <td className="hidden px-4 py-3 text-white/50 lg:table-cell">
                      {m.esperaPromMs ? formatMs(m.esperaPromMs) : "—"}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className={m.noShows > 0 ? "text-[#D85A30]" : "text-white/40"}>{m.noShows}</span>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className={m.canceladas > 2 ? "text-[#D85A30]" : "text-white/40"}>{m.canceladas}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        m.retencion >= 30 ? "bg-[#1D9E75]/20 text-[#1D9E75]" :
                        m.retencion >= 15 ? "bg-[#BA7517]/20 text-[#BA7517]" :
                        "bg-white/10 text-white/40"
                      }`}>
                        {m.retencion}%
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-white/30 lg:table-cell">
                      {m.ultimaActividad ? new Date(m.ultimaActividad).toLocaleDateString("es-AR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SortHeader({ label, sortKey, current, asc, onClick, className }: {
  label: string; sortKey: SortKey; current: SortKey; asc: boolean; onClick: (k: SortKey) => void; className?: string;
}) {
  return (
    <th className={`px-4 py-3 ${className ?? ""}`}>
      <button onClick={() => onClick(sortKey)} className="flex items-center gap-1 hover:text-white/60">
        {label}
        <ArrowUpDown size={12} className={current === sortKey ? "text-[#378ADD]" : "text-white/20"} />
      </button>
    </th>
  );
}
