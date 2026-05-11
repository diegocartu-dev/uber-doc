"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import StatusBadge from "../components/StatusBadge";

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

const TIPOS_CANCELACION = [
  { key: "", label: "Todos" },
  { key: "cancelado_medico", label: "Cancelado por medico" },
  { key: "cancelado_paciente", label: "Cancelado por paciente" },
  { key: "ausente_paciente", label: "Ausente paciente" },
  { key: "ausente_medico", label: "Ausente medico" },
  { key: "cancelada", label: "CI cancelada" },
];

const MODALIDADES = [
  { key: "", label: "Todas" },
  { key: "CI", label: "CI" },
  { key: "Turno", label: "Turno" },
];

const REEMBOLSO_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  reembolsado: "Reembolsado",
  usado_reprogramacion: "Reprogramado",
};

export default function CancelacionesTab() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtroMedico, setFiltroMedico] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroModalidad, setFiltroModalidad] = useState("");
  const [vista, setVista] = useState<"tabla" | "medicos">("tabla");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ periodo });
    if (periodo === "personalizado") {
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
    }
    if (filtroMedico) params.set("medico", filtroMedico);
    if (filtroTipo) params.set("tipo_cancelacion", filtroTipo);
    if (filtroModalidad) params.set("modalidad", filtroModalidad);

    try {
      const res = await fetch(`/api/admin/cancelaciones?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [periodo, desde, hasta, filtroMedico, filtroTipo, filtroModalidad]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const { kpis, cancelaciones, medico_stats, promedios, medicos_disponibles } = data;

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
          label="Por medico"
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
          Distribucion por tipo
        </p>
        <div className="flex flex-wrap gap-3">
          <DistItem label="Cancelado por medico" count={kpis.por_tipo.cancelado_medico} color="#E24B4A" />
          <DistItem label="Cancelado por paciente" count={kpis.por_tipo.cancelado_paciente} color="#BA7517" />
          <DistItem label="Ausente paciente" count={kpis.por_tipo.ausente_paciente} color="#D85A30" />
          <DistItem label="Ausente medico" count={kpis.por_tipo.ausente_medico} color="#D85A30" />
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
            Por medico
          </button>
        </div>

        {vista === "tabla" && (
          <>
            <select
              value={filtroMedico}
              onChange={(e) => setFiltroMedico(e.target.value)}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-[#378ADD] focus:outline-none"
            >
              <option value="">Todos los medicos</option>
              {medicos_disponibles.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>

            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-[#378ADD] focus:outline-none"
            >
              {TIPOS_CANCELACION.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>

            <select
              value={filtroModalidad}
              onChange={(e) => setFiltroModalidad(e.target.value)}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-[#378ADD] focus:outline-none"
            >
              {MODALIDADES.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Cancelaciones table */}
      {vista === "tabla" && (
        cancelaciones.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center" style={{ border: "1px solid #e5e7eb" }}>
            <p className="text-gray-500">No se encontraron cancelaciones en este periodo</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white" style={{ border: "1px solid #e5e7eb" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Modalidad</th>
                  <th className="px-4 py-3">Medico</th>
                  <th className="px-4 py-3">Paciente</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Motivo</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Reembolso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cancelaciones.map((c) => (
                  <tr key={`${c.tipo}-${c.id}`} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(c.fecha).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "short",
                        timeZone: "America/Argentina/Buenos_Aires",
                      })}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
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
                    <td className="hidden max-w-[200px] truncate px-4 py-3 text-xs text-gray-400 lg:table-cell">
                      {c.motivo ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
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
        )
      )}

      {/* Per-medico stats table */}
      {vista === "medicos" && (
        medico_stats.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center" style={{ border: "1px solid #e5e7eb" }}>
            <p className="text-gray-500">No hay datos de medicos para este periodo</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white" style={{ border: "1px solid #e5e7eb" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3">Medico</th>
                  <th className="px-4 py-3 text-center">Total turnos</th>
                  <th className="px-4 py-3 text-center">Canceladas por el</th>
                  <th className="px-4 py-3 text-center">Plantadas (no inicio)</th>
                  <th className="hidden px-4 py-3 text-center lg:table-cell">Cancel. por pacientes</th>
                  <th className="px-4 py-3 text-center">Tasa total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {medico_stats.map((m) => {
                  const rateCancelEl = m.total_turnos > 0 ? m.canceladas_por_el / m.total_turnos : 0;
                  const ratePlantadas = m.total_turnos > 0 ? m.plantadas_no_inicio / m.total_turnos : 0;
                  const ratePacientes = m.total_turnos > 0 ? m.canceladas_por_pacientes / m.total_turnos : 0;

                  return (
                    <tr key={m.medico_id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{m.medico}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{m.total_turnos}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="font-medium"
                          style={{ color: colorPorUmbral(rateCancelEl, promedios.canceladas_por_el) }}
                        >
                          {m.canceladas_por_el} ({pct(m.canceladas_por_el, m.total_turnos)})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="font-medium"
                          style={{ color: colorPorUmbral(ratePlantadas, promedios.plantadas_no_inicio) }}
                        >
                          {m.plantadas_no_inicio} ({pct(m.plantadas_no_inicio, m.total_turnos)})
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-center lg:table-cell">
                        <span
                          className="font-medium"
                          style={{ color: colorPorUmbral(ratePacientes, promedios.canceladas_por_pacientes) }}
                        >
                          {m.canceladas_por_pacientes} ({pct(m.canceladas_por_pacientes, m.total_turnos)})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
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
