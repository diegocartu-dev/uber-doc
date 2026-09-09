"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2 } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import { BarraTabla, CabezaTabla, useVistaTabla, type Columna } from "@/components/tabla/TablaDatos";

type Periodo = "hoy" | "semana" | "mes" | "personalizado";

interface KPIs {
  total_cancelaciones: number;
  tasa_global: number;
  por_tipo: {
    cancelado_medico: number;
    cancelado_paciente: number;
    ausente_paciente: number;
    ausente_medico: number;
    cancelada_ci: number;
  };
}

interface CancelacionRow {
  id: string;
  tipo: "CI" | "Turno";
  modalidad: string;
  estado: string;
  medico: string;
  paciente: string;
  fecha: string;
  motivo: string | null;
  reembolso: string | null;
}

interface MedicoStats {
  medico_id: string;
  medico: string;
  total_turnos: number;
  canceladas_por_el: number;
  plantadas_no_inicio: number;
  canceladas_por_pacientes: number;
  tasa_total: number;
}

interface MedicoOption {
  id: string;
  nombre: string;
}

interface Data {
  kpis: KPIs;
  cancelaciones: CancelacionRow[];
  medico_stats: MedicoStats[];
  promedios: {
    canceladas_por_el: number;
    plantadas_no_inicio: number;
    canceladas_por_pacientes: number;
    tasa_total: number;
  };
  medicos_disponibles: MedicoOption[];
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function colorPorUmbral(rate: number, promedio: number): string {
  if (promedio === 0 && rate === 0) return "#1D9E75";
  if (promedio === 0 && rate > 0) return "#E24B4A";
  if (rate <= promedio) return "#1D9E75";
  if (rate <= promedio * 1.5) return "#BA7517";
  return "#E24B4A";
}

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "personalizado", label: "Personalizado" },
];

const REEMBOLSO_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  reembolsado: "Reembolsado",
  usado_reprogramacion: "Reprogramado",
};

/** Las mismas palabras que muestra StatusBadge. El embudo filtra por lo que se LEE
 *  en la celda, no por el nombre interno del estado. */
const DESENLACE_LABEL: Record<string, string> = {
  cancelado_medico: "Cancelado (med.)",
  ausente_medico: "Ausente (med.)",
  cancelado_paciente: "Cancelado (pac.)",
  ausente_paciente: "Ausente (pac.)",
  cancelada: "Cancelada",
};

/** De quién fue la caída: primero lo que nos toca a nosotros. */
const CICLO_DESENLACE = ["Cancelado (med.)", "Ausente (med.)", "Cancelado (pac.)", "Ausente (pac.)", "Cancelada"];

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
}

export default function CancelacionesTab() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [vista, setVista] = useState<"tabla" | "medicos">("tabla");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ periodo });
    if (periodo === "personalizado") {
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
    }
    try {
      const res = await fetch(`/api/admin/cancelaciones?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [periodo, desde, hasta]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Las columnas se declaran antes del primer return: los hooks de la vista de tabla
  // no pueden quedar detrás de un `if`.
  const cancelaciones = useMemo(() => data?.cancelaciones ?? [], [data]);
  const medicoStats = useMemo(() => data?.medico_stats ?? [], [data]);

  const COLS_CANCEL: Columna<CancelacionRow>[] = useMemo(() => [
    { k: "fecha", t: "Fecha", val: (c) => c.fecha, tipo: "fecha", porEvento: true, busca: (c) => fechaCorta(c.fecha) },
    { k: "modalidad", t: "Modalidad", val: (c) => c.tipo },
    { k: "medico", t: "Médico", val: (c) => c.medico },
    { k: "paciente", t: "Paciente", val: (c) => c.paciente },
    { k: "desenlace", t: "Tipo", val: (c) => DESENLACE_LABEL[c.estado] ?? c.estado, rango: CICLO_DESENLACE },
    { k: "motivo", t: "Motivo", val: (c) => c.motivo ?? "", porEvento: true },
    { k: "reembolso", t: "Reembolso", val: (c) => (c.reembolso ? REEMBOLSO_LABELS[c.reembolso] ?? c.reembolso : "—") },
  ], []);
  const tCancel = useVistaTabla(cancelaciones, COLS_CANCEL, {
    clave: (c) => `${c.tipo}-${c.id}`,
    defecto: (a, b) => Date.parse(b.fecha) - Date.parse(a.fecha),
  });

  const COLS_MEDICOS: Columna<MedicoStats>[] = useMemo(() => [
    { k: "medico", t: "Médico", val: (m) => m.medico },
    { k: "turnos", t: "Total turnos", val: (m) => m.total_turnos, num: true, porEvento: true },
    { k: "canceladas", t: "Canceladas por él", val: (m) => m.canceladas_por_el, num: true, porEvento: true },
    { k: "plantadas", t: "Plantadas (no inició)", val: (m) => m.plantadas_no_inicio, num: true, porEvento: true },
    { k: "pacientes", t: "Cancel. por pacientes", val: (m) => m.canceladas_por_pacientes, num: true, porEvento: true },
    { k: "tasa", t: "Tasa total", val: (m) => m.tasa_total, num: true, porEvento: true },
  ], []);
  // Acá NO manda "lo más nuevo": la fila no es un hecho con fecha sino el acumulado de
  // un profesional, y lo que se busca es a quién mirar primero. Motivo escrito, como
  // pide la regla 4 para desviarse del orden por defecto.
  const tMedicos = useVistaTabla(medicoStats, COLS_MEDICOS, {
    clave: (m) => m.medico_id,
    defecto: (a, b) => b.tasa_total - a.tasa_total,
    prefijo: "m_",
  });

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-4 rounded-xl bg-white p-8 text-center" style={{ border: "1px solid #e5e7eb" }}>
        <p className="text-gray-500">Error cargando datos</p>
      </div>
    );
  }

  const { kpis, promedios } = data;

  return (
    <div className="mt-4 space-y-4">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriodo(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              periodo === key
                ? "bg-[#378ADD] text-white"
                : "border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}

        {periodo === "personalizado" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-[#378ADD] focus:outline-none"
            />
            <span className="text-xs text-gray-400">a</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-[#378ADD] focus:outline-none"
            />
          </div>
        )}

        {loading && <Loader2 size={14} className="animate-spin text-gray-400" />}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Total cancelaciones" value={kpis.total_cancelaciones.toString()} />
        <KPICard label="Tasa global" value={`${Math.round(kpis.tasa_global * 100)}%`} />
        <KPICard
          label="Por médico"
          value={kpis.por_tipo.cancelado_medico.toString()}
          sub={`+ ${kpis.por_tipo.ausente_medico} ausente`}
        />
        <KPICard
          label="Por paciente"
          value={kpis.por_tipo.cancelado_paciente.toString()}
          sub={`+ ${kpis.por_tipo.ausente_paciente} ausente`}
        />
      </div>

      {/* Distribution breakdown */}
      <div className="rounded-xl bg-white p-4" style={{ border: "1px solid #e5e7eb" }}>
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
          Distribución por tipo
        </p>
        <div className="flex flex-wrap gap-3">
          <DistItem label="Cancelado por médico" count={kpis.por_tipo.cancelado_medico} color="#E24B4A" />
          <DistItem label="Cancelado por paciente" count={kpis.por_tipo.cancelado_paciente} color="#BA7517" />
          <DistItem label="Ausente paciente" count={kpis.por_tipo.ausente_paciente} color="#D85A30" />
          <DistItem label="Ausente médico" count={kpis.por_tipo.ausente_medico} color="#D85A30" />
          <DistItem label="CI cancelada" count={kpis.por_tipo.cancelada_ci} color="#888780" />
        </div>
      </div>

      {/* View toggle + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200">
          <button
            onClick={() => setVista("tabla")}
            className={`px-3 py-1.5 text-xs font-medium ${
              vista === "tabla" ? "bg-gray-100 text-gray-900" : "text-gray-500"
            }`}
          >
            Cancelaciones
          </button>
          <button
            onClick={() => setVista("medicos")}
            className={`px-3 py-1.5 text-xs font-medium ${
              vista === "medicos" ? "bg-gray-100 text-gray-900" : "text-gray-500"
            }`}
          >
            Por médico
          </button>
        </div>

      </div>

      {/* Cancelaciones table */}
      {vista === "tabla" && (
        cancelaciones.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center" style={{ border: "1px solid #e5e7eb" }}>
            <p className="text-gray-500">No se encontraron cancelaciones en este período</p>
          </div>
        ) : (
          <>
          <BarraTabla vista={tCancel} placeholder="Buscar por médico, paciente o motivo…" cuenta="cancelaciones" />
          <div className="overflow-auto rounded-xl bg-white max-h-[72vh]" style={{ border: "1px solid #e5e7eb" }}>
            <table className="w-full border-separate border-spacing-0 text-sm">
              <CabezaTabla vista={tCancel} />
              <tbody>
                {tCancel.filas.map((c) => (
                  <tr key={`${c.tipo}-${c.id}`} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(c.fecha).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "short",
                        timeZone: "America/Argentina/Buenos_Aires",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        c.tipo === "CI" ? "bg-blue-50 text-[#378ADD]" : "bg-purple-50 text-purple-600"
                      }`}>
                        {c.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.medico}</td>
                    <td className="px-4 py-3 text-gray-600">{c.paciente}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.estado} />
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-xs text-gray-400" title={c.motivo ?? undefined}>
                      {c.motivo ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.reembolso ? (
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          c.reembolso === "reembolsado"
                            ? "bg-emerald-50 text-[#1D9E75]"
                            : c.reembolso === "pendiente"
                              ? "bg-amber-50 text-[#BA7517]"
                              : "bg-blue-50 text-[#378ADD]"
                        }`}>
                          {REEMBOLSO_LABELS[c.reembolso] ?? c.reembolso}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )
      )}

      {/* Per-medico stats table */}
      {vista === "medicos" && (
        medicoStats.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center" style={{ border: "1px solid #e5e7eb" }}>
            <p className="text-gray-500">No hay datos de profesionales para este período</p>
          </div>
        ) : (
          <>
          <BarraTabla vista={tMedicos} placeholder="Buscar médico…" cuenta="profesionales" />
          <div className="overflow-auto rounded-xl bg-white max-h-[72vh]" style={{ border: "1px solid #e5e7eb" }}>
            <table className="w-full border-separate border-spacing-0 text-sm">
              <CabezaTabla vista={tMedicos} />
              <tbody>
                {tMedicos.filas.map((m) => {
                  const rateCancelEl = m.total_turnos > 0 ? m.canceladas_por_el / m.total_turnos : 0;
                  const ratePlantadas = m.total_turnos > 0 ? m.plantadas_no_inicio / m.total_turnos : 0;
                  const ratePacientes = m.total_turnos > 0 ? m.canceladas_por_pacientes / m.total_turnos : 0;

                  return (
                    <tr key={m.medico_id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{m.medico}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{m.total_turnos}</td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-medium"
                          style={{ color: colorPorUmbral(rateCancelEl, promedios.canceladas_por_el) }}
                        >
                          {m.canceladas_por_el} ({pct(m.canceladas_por_el, m.total_turnos)})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-medium"
                          style={{ color: colorPorUmbral(ratePlantadas, promedios.plantadas_no_inicio) }}
                        >
                          {m.plantadas_no_inicio} ({pct(m.plantadas_no_inicio, m.total_turnos)})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-medium"
                          style={{ color: colorPorUmbral(ratePacientes, promedios.canceladas_por_pacientes) }}
                        >
                          {m.canceladas_por_pacientes} ({pct(m.canceladas_por_pacientes, m.total_turnos)})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-semibold"
                          style={{ color: colorPorUmbral(m.tasa_total, promedios.tasa_total) }}
                        >
                          {m.canceladas_por_el + m.plantadas_no_inicio + m.canceladas_por_pacientes} ({pct(m.canceladas_por_el + m.plantadas_no_inicio + m.canceladas_por_pacientes, m.total_turnos)})
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )
      )}
    </div>
  );
}

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-4" style={{ border: "1px solid #e5e7eb" }}>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function DistItem({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs text-gray-600">{label}: <span className="font-medium">{count}</span></span>
    </div>
  );
}
