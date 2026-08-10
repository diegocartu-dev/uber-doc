"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Download, AlertTriangle } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import ConfirmDialog from "../components/ConfirmDialog";
import PacientesEsperando from "./PacientesEsperando";
import CancelacionesTab from "./CancelacionesTab";

interface ConsultaItem {
  id: string;
  tipo: "CI" | "Turno";
  canal?: "ci" | "clinica" | "consultorio";
  estado: string;
  medico: string;
  paciente: string;
  inicio: string;
  especialidad: string;
  solicitada?: string;
  citaPara?: string | null;
}

const fechaHoraAR = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "America/Argentina/Buenos_Aires",
  });

// Fecha de HOY (o con offset de días) en día argentino, formato YYYY-MM-DD
// para los inputs type=date.
const fechaAR = (offsetDias = 0) => {
  const d = new Date(Date.now() - offsetDias * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);
};

type Tab = "esperando" | "en_curso" | "hoy" | "historial" | "cancelaciones";

// Etiquetas propias de esta pantalla, sólo para los estados crudos que no se
// entienden leyéndolos. Todo lo demás sigue con StatusBadge tal cual está.
// 'reservado_pendiente' acá es SIEMPRE una reserva viva (la API ya descarta las
// abandonadas): el paciente está pagando, todavía no es una consulta.
const ETIQUETAS_ESTADO: Record<string, { label: string; bg: string; text: string }> = {
  reservado_pendiente: { label: "Pendiente de pago", bg: "bg-[#BA7517]/15", text: "text-[#BA7517]" },
};

function EstadoChip({ estado }: { estado: string }) {
  const propio = ETIQUETAS_ESTADO[estado];
  if (!propio) return <StatusBadge status={estado} />;
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${propio.bg} ${propio.text}`}>
      {propio.label}
    </span>
  );
}

export default function ConsultasClient() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("esperando");
  const [items, setItems] = useState<ConsultaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState<1 | 7 | 30>(1);
  // Default: últimos 7 días. Los inputs SIEMPRE reflejan el rango realmente
  // aplicado — con el estado inicial vacío la pantalla mostraba "todo" mientras
  // los inputs podían decir otra cosa (reclamo Diego 04/08: filtro que no filtra).
  const [desde, setDesde] = useState(() => fechaAR(6));
  const [hasta, setHasta] = useState(() => fechaAR(0));
  const [forzando, setForzando] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (tab === "esperando" || tab === "cancelaciones") { setLoading(false); return; }
    const params = new URLSearchParams({ tab });
    if (tab === "hoy") params.set("dias", String(dias));
    if (tab === "historial") {
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
    }
    try {
      const res = await fetch(`/api/admin/consultas?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [tab, desde, hasta, dias]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (tab !== "en_curso") return;
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [tab, fetchData]);

  async function forzarCierre(id: string, tipo: string) {
    setProcesando(id);
    try {
      const res = await fetch("/api/admin/consultas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tipo: tipo === "CI" ? "consulta" : "turno" }),
      });
      const data = await res.json();
      if (data.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    } catch { /* ignore */ }
    setProcesando(null);
    setForzando(null);
  }

  function csvEscape(val: string) {
    let safe = val;
    if (/^[=+\-@\t\r]/.test(safe)) safe = "'" + safe;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    const header = tab === "hoy"
      ? "ID,Tipo,Canal,Estado,Médico,Paciente,Solicitada,Turno para,Especialidad\n"
      : "ID,Tipo,Estado,Médico,Paciente,Inicio,Especialidad\n";
    const rows = items.map((i) =>
      (tab === "hoy"
        ? [csvEscape(i.id), csvEscape(i.tipo), csvEscape(i.canal ?? ""), csvEscape(i.estado), csvEscape(i.medico), csvEscape(i.paciente), csvEscape(i.solicitada ?? ""), csvEscape(i.citaPara ?? ""), csvEscape(i.especialidad)]
        : [csvEscape(i.id), csvEscape(i.tipo), csvEscape(i.estado), csvEscape(i.medico), csvEscape(i.paciente), csvEscape(i.inicio), csvEscape(i.especialidad)]
      ).join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consultas-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function tiempoTranscurrido(inicio: string) {
    const diff = Date.now() - new Date(inicio).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}min`;
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Consultas</h1>
        {items.length > 0 && tab !== "esperando" && tab !== "cancelaciones" && (
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <Download size={14} /> Exportar CSV
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 border-b border-gray-200">
        {([
          { key: "esperando" as const, label: "Pacientes esperando" },
          { key: "en_curso" as const, label: "En curso ahora" },
          { key: "hoy" as const, label: "Actividad" },
          { key: "historial" as const, label: "Historial" },
          { key: "cancelaciones" as const, label: "Cancelaciones" },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? "text-[#378ADD] border-b-2 border-[#378ADD]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {key === "en_curso" && items.length > 0 && tab === "en_curso" && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#378ADD] px-1.5 text-[11px] font-semibold text-white">
                {items.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Pacientes esperando tab */}
      {tab === "esperando" && <PacientesEsperando />}

      {/* Cancelaciones tab */}
      {tab === "cancelaciones" && <CancelacionesTab />}

      {/* Selector de período de Actividad */}
      {tab === "hoy" && (
        <div className="mt-4 flex items-center gap-2">
          {([{ v: 1 as const, l: "Hoy" }, { v: 7 as const, l: "7 días" }, { v: 30 as const, l: "30 días" }]).map(({ v, l }) => (
            <button
              key={v}
              onClick={() => setDias(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                dias === v ? "bg-[#378ADD] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {l}
            </button>
          ))}
          <span className="ml-2 text-xs text-gray-400">
            Consultas reales del período + turnos solicitados en el período (aunque la cita sea futura). Sin huecos de agenda ni reservas abandonadas.
          </span>
        </div>
      )}

      {/* Historial filters */}
      {tab === "historial" && (
        <div className="mt-4 flex items-center gap-3">
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-[#378ADD] focus:outline-none"
          />
          <span className="text-sm text-gray-400">a</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-[#378ADD] focus:outline-none"
          />
        </div>
      )}

      {/* Content (not for esperando tab) */}
      {tab === "esperando" || tab === "cancelaciones" ? null : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-xl bg-white p-8 text-center" style={{ border: "1px solid #e5e7eb" }}>
          <p className="text-gray-500">
            {tab === "en_curso" ? "No hay consultas en curso" : "No se encontraron consultas"}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl bg-white" style={{ border: "1px solid #e5e7eb" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Médico</th>
                <th className="px-4 py-3">Paciente</th>
                <th className="hidden px-4 py-3 lg:table-cell">Estado</th>
                {tab === "hoy" ? (
                  <>
                    <th className="px-4 py-3">Solicitada</th>
                    <th className="px-4 py-3">Turno para</th>
                  </>
                ) : (
                  <th className="px-4 py-3">{tab === "en_curso" ? "Tiempo" : "Inicio"}</th>
                )}
                {tab === "en_curso" && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => {
                const esHuerfana = tab === "en_curso" && (Date.now() - new Date(item.inicio).getTime()) > 2 * 60 * 60 * 1000;
                return (
                  <tr
                    key={`${item.tipo}-${item.id}`}
                    onClick={() => {
                      if (tab === "hoy" || tab === "historial") {
                        router.push(`/admin/consultas/${item.id}?tipo=${item.tipo === "Turno" ? "turno" : "ci"}`);
                      }
                    }}
                    className={`${tab === "hoy" || tab === "historial" ? "cursor-pointer" : ""} hover:bg-gray-50/50 ${esHuerfana ? "bg-red-50/30" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${
                        item.tipo === "CI"
                          ? "bg-blue-50 text-[#378ADD]"
                          : item.canal === "consultorio"
                            ? "bg-amber-50 text-[#BA7517]"
                            : "bg-purple-50 text-purple-600"
                      }`}>
                        {item.tipo === "CI" ? "CI" : item.canal === "consultorio" ? "Turno consult." : "Turno clínica"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{item.medico}</td>
                    <td className="px-4 py-3 text-gray-600">{item.paciente}</td>
                    <td className="hidden px-4 py-3 lg:table-cell"><EstadoChip estado={item.estado} /></td>
                    {tab === "hoy" ? (
                      <>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                          {item.solicitada ? fechaHoraAR(item.solicitada) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                          {item.citaPara ? fechaHoraAR(item.citaPara) : <span className="text-gray-300">—</span>}
                        </td>
                      </>
                    ) : (
                    <td className="px-4 py-3 text-gray-500">
                      {tab === "en_curso" ? (
                        <span className={esHuerfana ? "font-medium text-[#E24B4A]" : ""}>
                          {tiempoTranscurrido(item.inicio)}
                          {esHuerfana && <AlertTriangle size={12} className="ml-1 inline text-[#E24B4A]" />}
                        </span>
                      ) : (
                        fechaHoraAR(item.inicio)
                      )}
                    </td>
                    )}
                    {tab === "en_curso" && (
                      <td className="px-4 py-3">
                        {esHuerfana && forzando !== item.id && (
                          <button
                            onClick={() => setForzando(item.id)}
                            className="rounded-lg border border-[#E24B4A] px-2.5 py-1 text-xs font-medium text-[#E24B4A] transition hover:bg-red-50"
                          >
                            Forzar cierre
                          </button>
                        )}
                        {forzando === item.id && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => forzarCierre(item.id, item.tipo)}
                              disabled={procesando === item.id}
                              className="rounded-lg bg-[#E24B4A] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                            >
                              {procesando === item.id ? <Loader2 size={12} className="animate-spin" /> : "Confirmar"}
                            </button>
                            <button
                              onClick={() => setForzando(null)}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              No
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
