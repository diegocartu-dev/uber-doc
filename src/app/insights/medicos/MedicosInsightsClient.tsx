"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { BarraTabla, CabezaTabla, useVistaTabla, type Columna } from "@/components/tabla/TablaDatos";

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

function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

/** La disponibilidad se decía SOLO con un punto de color al lado del nombre. Ahora también
 *  con la palabra, y se puede filtrar por ella (regla 6 del mandato de tablas). */
const CICLO_DISPONIBLE = ["Disponible", "No disponible"];

export default function MedicosInsightsClient() {
  const [medicos, setMedicos] = useState<MedicoStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const sp = useSearchParams();
  const real = sp.get("real") !== "0";

  useEffect(() => {
    setLoading(true);
    fetch(`/api/insights/medicos?dias=${dias}&real=${real ? 1 : 0}`)
      .then(r => r.json())
      .then(d => setMedicos(d.medicos ?? []))
      .finally(() => setLoading(false));
  }, [dias, real]);

  const COLUMNAS: Columna<MedicoStat>[] = useMemo(() => [
    { k: "nombre", t: "Médico", val: (m) => m.nombre },
    { k: "estado", t: "Estado", val: (m) => (m.disponible ? "Disponible" : "No disponible"), rango: CICLO_DISPONIBLE },
    { k: "especialidad", t: "Especialidad", val: (m) => m.especialidad },
    { k: "provincia", t: "Provincia", val: (m) => m.jurisdicciones.join(", ") },
    { k: "atendidas", t: "Atendidas", val: (m) => m.atendidas ?? m.consultas, num: true, porEvento: true },
    { k: "total", t: "Total", val: (m) => m.total, num: true, porEvento: true },
    { k: "cobrado", t: "Cobrado", val: (m) => m.cobrado, num: true, porEvento: true,
      ayuda: "Pagos aprobados en Mercado Pago del período, sin los reembolsos" },
    { k: "comision", t: "Comisión", val: (m) => m.comision, num: true, porEvento: true,
      ayuda: "El fee real que registró Mercado Pago" },
    { k: "valorTurno", t: "Valor turno", val: (m) => m.valorTurno, num: true, porEvento: true,
      ayuda: "El precio de su última atención de este tipo, o el que tiene configurado si todavía no tuvo" },
    { k: "valorCI", t: "Valor CI", val: (m) => m.valorCI, num: true, porEvento: true,
      ayuda: "El precio de su última atención de este tipo, o el que tiene configurado si todavía no tuvo" },
    { k: "noShows", t: "No-shows", val: (m) => m.noShows, num: true, porEvento: true },
    { k: "canceladas", t: "Cancel.", val: (m) => m.canceladas, num: true, porEvento: true },
    { k: "ultima", t: "Última act.", val: (m) => m.ultimaActividad, tipo: "fecha", porEvento: true,
      busca: (m) => (m.ultimaActividad ? new Date(m.ultimaActividad + "T12:00:00").toLocaleDateString("es-AR") : "") },
  ], []);
  // Acá NO manda "lo más nuevo": esta lista es un ranking, no un registro de hechos, y
  // arriba va quien más facturó. Motivo escrito, como pide la regla 4 para desviarse.
  const vista = useVistaTabla(medicos, COLUMNAS, {
    clave: (m) => m.id,
    defecto: (a, b) => b.cobrado - a.cobrado,
    tono: "oscuro",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Médicos</h1>
        <div className="flex flex-wrap items-center gap-3">
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
        <div>
          <BarraTabla vista={vista} placeholder="Buscar médico, especialidad o provincia…" cuenta="profesionales" />
          <div className="rounded-xl bg-[#1E293B]" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="overflow-auto max-h-[68vh]">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <CabezaTabla vista={vista} />
                <tbody>
                  {vista.filas.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNAS.length} className="px-4 py-10 text-center text-white/40">
                        {vista.hay ? "Ningún profesional con esos filtros." : "Sin médicos en el período."}
                      </td>
                    </tr>
                  )}
                  {vista.filas.map(m => (
                    <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-medium text-white/90">{m.nombre}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-white/60">
                          <span className={`h-2 w-2 rounded-full ${m.disponible ? "bg-[#1D9E75]" : "bg-white/20"}`} />
                          {m.disponible ? "Disponible" : "No disponible"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/50">{m.especialidad}</td>
                      <td className="px-4 py-3 text-white/60">
                        {m.jurisdicciones.length > 0 ? m.jurisdicciones.join(", ") : <span className="text-white/25">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-white/70">
                        {m.atendidas ?? m.consultas}
                        {(m.atendidas ?? 0) > 0 && (
                          <span className="block whitespace-nowrap text-[11px] text-white/35">
                            {m.atendidasCI} CI · {m.atendidasTurnoClinica} clín. · {m.atendidasTurnoConsultorio} consult.
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-white/40">{m.total ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-medium text-white/90">{formatARS(m.cobrado)}</td>
                      <td className="px-4 py-3 text-right text-[#378ADD]">{formatARS(m.comision)}</td>
                      <td className="px-4 py-3 text-right text-white/70">
                        {m.valorTurno != null ? formatARS(m.valorTurno) : <span className="text-white/25">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-white/70">
                        {m.valorCI != null ? formatARS(m.valorCI) : <span className="text-white/25">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={m.noShows > 0 ? "text-[#D85A30]" : "text-white/40"}>{m.noShows}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={m.canceladas > 2 ? "text-[#D85A30]" : "text-white/40"}>{m.canceladas}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-white/30">
                        {m.ultimaActividad ? new Date(m.ultimaActividad + "T12:00:00").toLocaleDateString("es-AR") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
