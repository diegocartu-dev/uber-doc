"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, ArrowUpDown, Search } from "lucide-react";

interface MedicoStat {
  id: string;
  nombre: string;
  especialidad: string;
  disponible: boolean;
  consultas: number; // = atendidas (compat)
  atendidas: number;
  atendidasCI: number;
  atendidasTurnoClinica: number;
  atendidasTurnoConsultorio: number;
  total: number;
  canceladas: number;
  noShows: number;
  cobrado: number;
  comision: number;
  jurisdicciones: string[];
  valorCI: number | null;
  valorTurno: number | null;
  ultimaActividad: string | null;
}

type SortKey = "nombre" | "consultas" | "cobrado" | "provincia" | "canceladas" | "noShows" | "valorCI" | "valorTurno";

function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}


// Búsqueda sin tildes ni mayúsculas ("perez" encuentra "Pérez").
const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function MedicosInsightsClient() {
  const [medicos, setMedicos] = useState<MedicoStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const [sortKey, setSortKey] = useState<SortKey>("cobrado");
  const [sortAsc, setSortAsc] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const sp = useSearchParams();
  const real = sp.get("real") !== "0";

  useEffect(() => {
    setLoading(true);
    fetch(`/api/insights/medicos?dias=${dias}&real=${real ? 1 : 0}`)
      .then(r => r.json())
      .then(d => setMedicos(d.medicos ?? []))
      .finally(() => setLoading(false));
  }, [dias, real]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  // Valor comparable por columna (provincia = jurisdicciones unidas como texto).
  function valorDe(m: MedicoStat, key: SortKey): string | number {
    if (key === "provincia") return m.jurisdicciones.join(", ");
    return (m[key] as string | number | null) ?? 0;
  }

  const q = normalizar(busqueda.trim());
  const filtrados = q
    ? medicos.filter(m =>
        normalizar(`${m.nombre} ${m.especialidad} ${m.jurisdicciones.join(" ")}`).includes(q)
      )
    : medicos;

  const sorted = [...filtrados].sort((a, b) => {
    const va = valorDe(a, sortKey);
    const vb = valorDe(b, sortKey);
    if (typeof va === "string") return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Médicos</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar médico, especialidad o provincia…"
              className="w-64 rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#378ADD]"
            />
          </div>
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
                  <SortHeader label="Provincia" sortKey="provincia" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <SortHeader label="Atendidas" sortKey="consultas" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <th className="hidden px-4 py-3 md:table-cell">Total</th>
                  <SortHeader label="Cobrado" sortKey="cobrado" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <th className="hidden px-4 py-3 lg:table-cell">Comisión</th>
                  <SortHeader label="Valor turno" sortKey="valorTurno" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <SortHeader label="Valor CI" sortKey="valorCI" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <SortHeader label="No-shows" sortKey="noShows" current={sortKey} asc={sortAsc} onClick={toggleSort} className="hidden md:table-cell" />
                  <SortHeader label="Cancel." sortKey="canceladas" current={sortKey} asc={sortAsc} onClick={toggleSort} className="hidden md:table-cell" />
                  <th className="hidden px-4 py-3 lg:table-cell">Última act.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-white/40">
                      {q ? `Sin resultados para "${busqueda.trim()}".` : "Sin médicos en el período."}
                    </td>
                  </tr>
                )}
                {sorted.map(m => (
                  <tr key={m.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${m.disponible ? "bg-[#1D9E75]" : "bg-white/20"}`} />
                        <span className="font-medium text-white/90">{m.nombre}</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-white/50 md:table-cell">{m.especialidad}</td>
                    <td className="px-4 py-3 text-white/60">
                      {m.jurisdicciones.length > 0 ? m.jurisdicciones.join(", ") : <span className="text-white/25">—</span>}
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      {m.atendidas ?? m.consultas}
                      {(m.atendidas ?? 0) > 0 && (
                        <span className="block whitespace-nowrap text-[11px] text-white/35">
                          {m.atendidasCI} CI · {m.atendidasTurnoClinica} clín. · {m.atendidasTurnoConsultorio} consult.
                        </span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-white/40 md:table-cell">{m.total ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-white/90">{formatARS(m.cobrado)}</td>
                    <td className="hidden px-4 py-3 text-[#378ADD] lg:table-cell">{formatARS(m.comision)}</td>
                    <td className="px-4 py-3 text-white/70">
                      {m.valorTurno != null ? formatARS(m.valorTurno) : <span className="text-white/25">—</span>}
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      {m.valorCI != null ? formatARS(m.valorCI) : <span className="text-white/25">—</span>}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className={m.noShows > 0 ? "text-[#D85A30]" : "text-white/40"}>{m.noShows}</span>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className={m.canceladas > 2 ? "text-[#D85A30]" : "text-white/40"}>{m.canceladas}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-white/30 lg:table-cell">
                      {m.ultimaActividad ? new Date(m.ultimaActividad + "T12:00:00").toLocaleDateString("es-AR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-center text-[11px] text-white/25">
        Cobrado = pagos aprobados en Mercado Pago del período (excluye reembolsos). Comisión = el fee real que registró MP. Valor turno / Valor CI = el precio de su última atención de cada tipo (o su precio configurado si aún no tuvo).
      </p>
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
