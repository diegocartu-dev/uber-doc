"use client";

import { useState, useEffect } from "react";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Minus, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

interface SerenoRun {
  id: string;
  fecha: string;
  passed: number;
  failed: number;
  total: number;
  duration_ms: number;
  status: "ok" | "fail";
  details: TestDetail[];
  created_at: string;
}

interface TestDetail {
  title: string;
  file: string;
  status: "passed" | "failed" | "skipped";
  error?: string;
  duration_ms?: number;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatFecha(fecha: string) {
  const d = new Date(fecha + "T12:00:00");
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function diasSinDatos(runs: SerenoRun[]): string[] {
  const hoy = new Date();
  const dias: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}

export default function SerenoClient() {
  const [runs, setRuns] = useState<SerenoRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function fetchRuns() {
    try {
      const res = await fetch("/api/admin/sereno");
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch { /* retry manually */ }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { fetchRuns(); }, []);

  function handleRefresh() {
    setRefreshing(true);
    fetchRuns();
  }

  const ultima = runs[0] ?? null;
  const dias7 = diasSinDatos(runs);
  const runsByFecha = new Map(runs.map((r) => [r.fecha, r]));

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sereno</h1>
          <p className="mt-1 text-sm text-gray-500">Quality Gate — tests E2E automatizados a las 3AM</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/diegocartu-dev/uber-doc/actions/workflows/playwright.yml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <ExternalLink size={14} /> GitHub Actions
          </a>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Actualizar
          </button>
        </div>
      </div>

      {/* Última corrida */}
      <div className="mt-6 rounded-xl bg-white p-6" style={{ border: "1px solid #e5e7eb" }}>
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400">Última corrida</h2>
        {!ultima ? (
          <p className="mt-3 text-gray-500">Sin corridas registradas</p>
        ) : (
          <div className="mt-3 flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
              ultima.status === "ok" ? "bg-[#1D9E75]/10" : "bg-[#E24B4A]/10"
            }`}>
              {ultima.status === "ok" ? (
                <CheckCircle2 size={24} color="#1D9E75" />
              ) : (
                <XCircle size={24} color="#E24B4A" />
              )}
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {ultima.status === "ok" ? "Todo OK" : `${ultima.failed} test${ultima.failed > 1 ? "s" : ""} fallaron`}
              </p>
              <p className="text-sm text-gray-500">
                {formatFecha(ultima.fecha)} a las {formatHora(ultima.created_at)} — {ultima.passed}/{ultima.total} pasaron — {formatDuration(ultima.duration_ms)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Semáforo 7 días */}
      <div className="mt-4 rounded-xl bg-white p-6" style={{ border: "1px solid #e5e7eb" }}>
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400">Últimos 7 días</h2>
        <div className="mt-4 flex gap-2">
          {dias7.map((dia) => {
            const run = runsByFecha.get(dia);
            const isToday = dia === new Date().toISOString().slice(0, 10);
            return (
              <button
                key={dia}
                onClick={() => run && setExpanded(expanded === run.id ? null : run.id)}
                className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg p-3 transition ${
                  run ? "cursor-pointer hover:bg-gray-50" : "cursor-default"
                } ${expanded === run?.id ? "bg-gray-50 ring-1 ring-[#378ADD]" : ""}`}
                disabled={!run}
              >
                <span className="text-xs text-gray-400">
                  {new Date(dia + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short" })}
                </span>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                  !run
                    ? "bg-gray-100"
                    : run.status === "ok"
                      ? "bg-[#1D9E75]"
                      : "bg-[#E24B4A]"
                }`}>
                  {!run ? (
                    <Minus size={14} className="text-gray-400" />
                  ) : run.status === "ok" ? (
                    <CheckCircle2 size={14} className="text-white" />
                  ) : (
                    <XCircle size={14} className="text-white" />
                  )}
                </div>
                <span className={`text-[10px] font-medium ${isToday ? "text-[#378ADD]" : "text-gray-400"}`}>
                  {new Date(dia + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detalle expandido */}
      {expanded && (() => {
        const run = runs.find((r) => r.id === expanded);
        if (!run || !run.details?.length) return null;
        return (
          <div className="mt-4 rounded-xl bg-white p-6" style={{ border: "1px solid #e5e7eb" }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400">
                Detalle — {formatFecha(run.fecha)}
              </h2>
              <button onClick={() => setExpanded(null)} className="text-gray-400 hover:text-gray-600">
                <ChevronUp size={16} />
              </button>
            </div>
            <div className="mt-3 divide-y divide-gray-100">
              {run.details.map((test, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5">
                  <div className="mt-0.5">
                    {test.status === "passed" ? (
                      <CheckCircle2 size={16} color="#1D9E75" />
                    ) : test.status === "skipped" ? (
                      <Minus size={16} color="#888780" />
                    ) : (
                      <XCircle size={16} color="#E24B4A" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${test.status === "failed" ? "font-medium text-gray-900" : "text-gray-600"}`}>
                      {test.title}
                    </p>
                    {test.file && (
                      <p className="text-xs text-gray-400 truncate">{test.file}</p>
                    )}
                    {test.error && (
                      <p className="mt-1 rounded bg-red-50 p-2 text-xs text-[#E24B4A] font-mono whitespace-pre-wrap">
                        {test.error}
                      </p>
                    )}
                  </div>
                  {test.duration_ms != null && (
                    <span className="text-xs text-gray-400 whitespace-nowrap">{formatDuration(test.duration_ms)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Info */}
      <div className="mt-4 rounded-xl bg-gray-50 p-4" style={{ border: "1px solid #e5e7eb" }}>
        <p className="text-xs text-gray-400">
          Sereno corre 10 tests E2E contra produccion todas las noches a las 3AM (Argentina).
          Usa cuentas de prueba dedicadas y limpia todo lo generado al finalizar.
          Los resultados se guardan automaticamente.
        </p>
      </div>
    </div>
  );
}
