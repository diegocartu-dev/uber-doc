"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Database,
  Video,
  CreditCard,
  Mail,
  Brain,
  Bell,
  Globe,
  Shield,
  FileCheck,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type Estado = "ok" | "degradado" | "error" | "no_configurado" | "simulacion" | "homologacion";

interface Integracion {
  nombre: string;
  icono: string;
  estado: Estado;
  detalle: string;
  latencia_ms: number | null;
  checked_at: string;
  error_tecnico?: string;
}

const ICON_MAP: Record<string, typeof Database> = {
  Database,
  Video,
  CreditCard,
  Mail,
  Brain,
  Bell,
  Globe,
  Shield,
  FileCheck,
  Sparkles,
};

const STATUS_CONFIG: Record<Estado, { color: string; Icon: typeof CheckCircle; label: string }> = {
  ok: { color: "#1D9E75", Icon: CheckCircle, label: "Activa" },
  degradado: { color: "#BA7517", Icon: AlertTriangle, label: "Degradada" },
  error: { color: "#D85A30", Icon: XCircle, label: "Caida" },
  no_configurado: { color: "#888780", Icon: AlertTriangle, label: "No integrada" },
  simulacion: { color: "#888780", Icon: AlertTriangle, label: "Simulacion" },
  // En homologación: el handshake técnico funciona pero aún no opera en producción
  homologacion: { color: "#378ADD", Icon: AlertTriangle, label: "Homologación" },
};

function tiempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seg = Math.floor(diff / 1000);
  if (seg < 60) return `hace ${seg}s`;
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.floor(min / 60);
  return `hace ${hrs}h`;
}

export default function IntegracionesTab() {
  const [integraciones, setIntegraciones] = useState<Integracion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/integraciones", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setIntegraciones(data.integraciones ?? []);
      }
    } catch { /* retain previous state */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Estado real de cada servicio externo conectado a Docto
        </p>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          Refrescar
        </button>
      </div>

      {integraciones.map((integ) => {
        const Icon = ICON_MAP[integ.icono] ?? AlertTriangle;
        const config = STATUS_CONFIG[integ.estado] ?? STATUS_CONFIG.no_configurado;
        const StatusIcon = config.Icon;
        const hasError = !!integ.error_tecnico;
        const isExpanded = expandedError === integ.nombre;

        return (
          <div key={integ.nombre}>
            <div
              className="flex items-center justify-between rounded-xl bg-white p-4"
              style={{ border: "1px solid #e5e7eb" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${config.color}15` }}
                >
                  <Icon size={16} style={{ color: config.color }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {integ.nombre}
                  </p>
                  <p className="text-xs text-gray-400">{integ.detalle}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-xs font-medium"
                      style={{ color: config.color }}
                    >
                      {config.label}
                    </span>
                    {integ.latencia_ms !== null && (
                      <span className="text-[10px] text-gray-300">
                        {integ.latencia_ms}ms
                      </span>
                    )}
                  </div>
                  {integ.checked_at && (
                    <p className="text-[10px] text-gray-300">
                      {tiempoRelativo(integ.checked_at)}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <StatusIcon size={18} style={{ color: config.color }} />
                  {hasError && (
                    <button
                      onClick={() =>
                        setExpandedError(isExpanded ? null : integ.nombre)
                      }
                      className="ml-0.5 text-gray-300 hover:text-gray-500"
                    >
                      {isExpanded ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {hasError && isExpanded && (
              <div
                className="mx-4 rounded-b-lg border-x border-b px-4 py-2 text-xs font-mono text-gray-500"
                style={{ borderColor: "#e5e7eb", backgroundColor: "#fafafa" }}
              >
                {integ.error_tecnico}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
