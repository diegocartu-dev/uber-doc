"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, CheckCircle, XCircle, AlertTriangle, AlertOctagon, Info } from "lucide-react";

interface Alerta {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string | null;
  entidad_tipo: string | null;
  entidad_id: string | null;
  severidad: string;
  estado: string;
  resuelta_por: string | null;
  resuelta_at: string | null;
  notas: string | null;
  created_at: string;
}

type Tab = "pendiente" | "resuelta" | "ignorada";

const severidadIcon: Record<string, typeof AlertTriangle> = {
  critica: AlertOctagon,
  alta: AlertTriangle,
  media: AlertTriangle,
  baja: Info,
};

const severidadColor: Record<string, string> = {
  critica: "#E24B4A",
  alta: "#D85A30",
  media: "#BA7517",
  baja: "#888780",
};

export default function AlertasClient() {
  const [tab, setTab] = useState<Tab>("pendiente");
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [resolviendo, setResolviendo] = useState<{ id: string; accion: string } | null>(null);
  const [nota, setNota] = useState("");

  const fetchAlertas = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/alertas?estado=${tab}`);
      const data = await res.json();
      setAlertas(data.alertas ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    fetchAlertas();
  }, [fetchAlertas]);

  async function handleAccion(alertaId: string, accion: string) {
    setProcesando(alertaId);
    try {
      const res = await fetch("/api/admin/alertas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertaId, accion, notas: nota.trim() || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setAlertas((prev) => prev.filter((a) => a.id !== alertaId));
      }
    } catch { /* ignore */ }
    setProcesando(null);
    setResolviendo(null);
    setNota("");
  }

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-gray-900">Alertas</h1>

      <div className="mt-5 flex gap-1 border-b border-gray-200">
        {([
          { key: "pendiente" as const, label: "Pendientes" },
          { key: "resuelta" as const, label: "Resueltas" },
          { key: "ignorada" as const, label: "Ignoradas" },
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
            {key === "pendiente" && alertas.length > 0 && tab === "pendiente" && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E24B4A] px-1.5 text-[11px] font-semibold text-white">
                {alertas.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : alertas.length === 0 ? (
        <div className="mt-4 rounded-xl bg-white p-8 text-center" style={{ border: "1px solid #e5e7eb" }}>
          <p className="text-gray-500">No hay alertas {tab === "pendiente" ? "pendientes" : tab === "resuelta" ? "resueltas" : "ignoradas"}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {alertas.map((a) => {
            const Icon = severidadIcon[a.severidad] ?? Info;
            const color = severidadColor[a.severidad] ?? "#888780";
            return (
              <div key={a.id} className="rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}15` }}>
                    <Icon size={16} style={{ color }} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{a.titulo}</h3>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase" style={{ backgroundColor: `${color}15`, color }}>
                        {a.severidad}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                        {a.tipo}
                      </span>
                    </div>
                    {a.descripcion && <p className="mt-1 text-sm text-gray-500">{a.descripcion}</p>}
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(a.created_at).toLocaleString("es-AR")}
                    </p>

                    {a.notas && (
                      <p className="mt-2 rounded bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
                        <span className="font-medium">Nota:</span> {a.notas}
                      </p>
                    )}

                    {tab === "pendiente" && resolviendo?.id === a.id && (
                      <div className="mt-3">
                        <textarea
                          value={nota}
                          onChange={(e) => setNota(e.target.value)}
                          placeholder="Nota (opcional)..."
                          rows={2}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#378ADD] focus:outline-none"
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => handleAccion(a.id, resolviendo.accion)}
                            disabled={procesando === a.id}
                            className="rounded-lg bg-[#378ADD] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                          >
                            {procesando === a.id ? <Loader2 size={12} className="animate-spin" /> : "Confirmar"}
                          </button>
                          <button
                            onClick={() => { setResolviendo(null); setNota(""); }}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {tab === "pendiente" && resolviendo?.id !== a.id && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => setResolviendo({ id: a.id, accion: "resolver" })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#1D9E75] px-3 py-1.5 text-xs font-medium text-[#1D9E75] transition hover:bg-emerald-50"
                        >
                          <CheckCircle size={14} /> Resolver
                        </button>
                        <button
                          onClick={() => setResolviendo({ id: a.id, accion: "ignorar" })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-50"
                        >
                          <XCircle size={14} /> Ignorar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
