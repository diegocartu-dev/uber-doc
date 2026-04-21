"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Download, AlertTriangle } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import ConfirmDialog from "../components/ConfirmDialog";

interface ConsultaItem {
  id: string;
  tipo: "CI" | "Turno";
  estado: string;
  medico: string;
  paciente: string;
  inicio: string;
  especialidad: string;
}

type Tab = "en_curso" | "hoy" | "historial";

export default function ConsultasClient() {
  const [tab, setTab] = useState<Tab>("en_curso");
  const [items, setItems] = useState<ConsultaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [forzando, setForzando] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams({ tab });
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
  }, [tab, desde, hasta]);

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

  function exportCsv() {
    const header = "ID,Tipo,Estado,Médico,Paciente,Inicio,Especialidad\n";
    const rows = items.map((i) =>
      [i.id, i.tipo, i.estado, `"${i.medico}"`, `"${i.paciente}"`, i.inicio, `"${i.especialidad}"`].join(",")
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
        {items.length > 0 && (
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
          { key: "en_curso" as const, label: "En curso ahora" },
          { key: "hoy" as const, label: "Hoy" },
          { key: "historial" as const, label: "Historial" },
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

      {/* Content */}
      {loading ? (
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
                <th className="px-4 py-3">{tab === "en_curso" ? "Tiempo" : "Inicio"}</th>
                {tab === "en_curso" && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => {
                const esHuerfana = tab === "en_curso" && (Date.now() - new Date(item.inicio).getTime()) > 2 * 60 * 60 * 1000;
                return (
                  <tr key={`${item.tipo}-${item.id}`} className={`hover:bg-gray-50/50 ${esHuerfana ? "bg-red-50/30" : ""}`}>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        item.tipo === "CI" ? "bg-blue-50 text-[#378ADD]" : "bg-purple-50 text-purple-600"
                      }`}>
                        {item.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{item.medico}</td>
                    <td className="px-4 py-3 text-gray-600">{item.paciente}</td>
                    <td className="hidden px-4 py-3 lg:table-cell"><StatusBadge status={item.estado} /></td>
                    <td className="px-4 py-3 text-gray-500">
                      {tab === "en_curso" ? (
                        <span className={esHuerfana ? "font-medium text-[#E24B4A]" : ""}>
                          {tiempoTranscurrido(item.inicio)}
                          {esHuerfana && <AlertTriangle size={12} className="ml-1 inline text-[#E24B4A]" />}
                        </span>
                      ) : (
                        new Date(item.inicio).toLocaleString("es-AR", { hour: "2-digit", minute: "2-digit" })
                      )}
                    </td>
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
