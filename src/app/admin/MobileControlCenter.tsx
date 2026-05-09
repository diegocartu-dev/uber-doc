"use client";

import { useState, useEffect } from "react";
import { Loader2, Stethoscope } from "lucide-react";
import Link from "next/link";
import KillSwitch from "./components/KillSwitch";
import MetricCard from "./components/MetricCard";

interface MobileData {
  estado: "verde" | "amarillo" | "rojo";
  pendientes: {
    pacientesEsperando: number;
    alertasPendientes: number;
    consultasHuerfanas: number;
    medicosPendientes: number;
  };
  flags: Array<{
    key: string;
    nombre: string;
    descripcion: string;
    activo: boolean;
    es_kill_switch: boolean;
  }>;
}

export default function MobileControlCenter() {
  const [data, setData] = useState<MobileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s en mobile
    return () => clearInterval(interval);
  }, []);

  async function fetchData() {
    try {
      const res = await fetch("/api/admin/dashboard-mobile");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // silencioso
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <p className="text-gray-500">Error cargando datos</p>
      </div>
    );
  }

  const killSwitches = data.flags.filter((f) => f.es_kill_switch);
  const otrosFlags = data.flags.filter((f) => !f.es_kill_switch);

  const estadoColor =
    data.estado === "verde"
      ? "#1D9E75"
      : data.estado === "amarillo"
        ? "#BA7517"
        : "#E24B4A";

  const estadoLabel =
    data.estado === "verde"
      ? "Todo OK"
      : data.estado === "amarillo"
        ? "Requiere atencion"
        : "Problemas criticos";

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Stethoscope size={20} strokeWidth={2} color="#378ADD" />
          <span className="text-base font-bold lowercase text-gray-900">
            docto
          </span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Control
          </span>
        </div>
      </div>

      <div className="space-y-5 p-4">
        {/* Banner de estado */}
        <div
          className="rounded-xl p-4 text-center"
          style={{ backgroundColor: estadoColor }}
        >
          <p className="text-lg font-bold text-white">{estadoLabel}</p>
        </div>

        {/* Estado ahora */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Estado ahora
          </h2>
          <div className="space-y-2">
            <MetricCard
              label="Medicos pendientes"
              value={data.pendientes.medicosPendientes}
              href="/admin/medicos"
              color={data.pendientes.medicosPendientes > 0 ? "#E24B4A" : "#888780"}
            />
            <MetricCard
              label="Alertas pendientes"
              value={data.pendientes.alertasPendientes}
              href="/admin/alertas"
              color={data.pendientes.alertasPendientes > 0 ? "#D85A30" : "#888780"}
            />
            <MetricCard
              label="Consultas huerfanas (>2h)"
              value={data.pendientes.consultasHuerfanas}
              href="/admin/consultas"
              color={data.pendientes.consultasHuerfanas > 0 ? "#E24B4A" : "#888780"}
            />
          </div>
        </section>

        {/* Kill switches */}
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Kill Switches
          </h2>
          <p className="mb-3 text-xs text-gray-400">
            Apagar funcionalidades si algo se rompio
          </p>
          <div className="space-y-2">
            {killSwitches.map((flag) => (
              <KillSwitch key={flag.key} flag={flag} desdeMobile />
            ))}
          </div>
        </section>

        {/* Otros flags */}
        {otrosFlags.length > 0 && (
          <details className="rounded-xl bg-white p-4" style={{ border: "1px solid #e5e7eb" }}>
            <summary className="cursor-pointer font-medium text-sm text-gray-700">
              Otros flags ({otrosFlags.length})
            </summary>
            <div className="mt-3 space-y-2">
              {otrosFlags.map((flag) => (
                <KillSwitch key={flag.key} flag={flag} desdeMobile />
              ))}
            </div>
          </details>
        )}

        {/* Footer */}
        <div className="pt-4 text-center">
          <Link
            href="/admin?force=desktop"
            className="text-sm text-[#378ADD] underline"
          >
            Ver version completa en desktop
          </Link>
        </div>
      </div>
    </div>
  );
}
