"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, Clock, AlertTriangle, Wallet } from "lucide-react";
import StatusBadge from "../components/StatusBadge";

type Tab = "cola" | "accion" | "deuda";

interface ColaRow {
  id: string;
  tipo: "turno" | "consulta";
  recurso_id: string;
  medico: string;
  paciente: string;
  monto: number;
  estado: string;
  intentos: number;
  ultimo_error: string | null;
  ultimo_intento_at: string;
  proximo_intento_at: string;
  creado_at: string;
  motivo: string | null;
}

interface AccionRow {
  id: string;
  tipo: "turno" | "consulta";
  recurso_id: string;
  medico: string;
  paciente: string;
  monto: number;
  creado_at: string;
  ultimo_error: string | null;
  cvu: string | null;
}

interface DeudaRow {
  medico_id: string;
  medico: string;
  total_debe: number;
  total_recuperado: number;
  restante: number;
  items: number;
}

interface Data {
  cola: ColaRow[];
  accionRequerida: AccionRow[];
  deudas: DeudaRow[];
  resumen: { pendientes: number; accionRequerida: number; deudaTotalRestante: number; montoPendienteTotal: number };
}

const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function desdeHace(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / (1000 * 60 * 60));
  if (h < 1) return "hace <1h";
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

// Mapeo de estado del refund → StatusBadge canónico del admin (design system).
// "Médico sin saldo" = bloqueo (rojo #E24B4A); "Falta fee Docto" = pendiente (amarillo #BA7517).
const ESTADO_BADGE: Record<string, { status: string; label: string }> = {
  pendiente: { status: "bloqueado", label: "Médico sin saldo" },
  fee_pendiente: { status: "pendiente", label: "Falta fee Docto" },
};

export default function ReembolsosClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("cola");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reembolsos");
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto mt-10 max-w-2xl rounded-xl bg-white p-8 text-center" style={{ border: "1px solid #e5e7eb" }}>
        <p className="text-gray-500">Error cargando datos de reembolsos.</p>
      </div>
    );
  }

  const { cola, accionRequerida, deudas, resumen } = data;

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "cola", label: "Pendientes", count: resumen.pendientes },
    { key: "accion", label: "Acción requerida", count: resumen.accionRequerida },
    { key: "deuda", label: "Deuda médicos", count: deudas.length },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reembolsos</h1>
          <p className="mt-0.5 text-sm text-gray-500">Cola de reintentos, acción manual y deuda de médicos.</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI icon={Wallet} label="Total a devolver" value={money(resumen.montoPendienteTotal)} color="#BA7517" />
        <KPI icon={Clock} label="Reembolsos pendientes" value={resumen.pendientes.toString()} color="#BA7517" />
        <KPI icon={AlertTriangle} label="Acción requerida (CVU)" value={resumen.accionRequerida.toString()} color="#E24B4A" />
        <KPI icon={Wallet} label="Deuda médicos (restante)" value={money(resumen.deudaTotalRestante)} color="#378ADD" />
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-2 border-b border-gray-100">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t.key ? "border-[#378ADD] text-[#378ADD]" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${tab === t.key ? "bg-[#378ADD]/10 text-[#378ADD]" : "bg-gray-100 text-gray-500"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "cola" && <ColaView rows={cola} />}
        {tab === "accion" && <AccionView rows={accionRequerida} />}
        {tab === "deuda" && <DeudaView rows={deudas} />}
      </div>
    </div>
  );
}

function KPI({ icon: Icon, label, value, color }: { icon: typeof Clock; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-white p-4" style={{ border: "1px solid #e5e7eb" }}>
      <div className="flex items-center gap-2">
        <Icon size={15} style={{ color }} strokeWidth={1.75} />
        <span className="text-xs font-medium text-gray-400">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="rounded-xl bg-white p-10 text-center" style={{ border: "1px solid #e5e7eb" }}>
      <p className="text-sm text-gray-400">{texto}</p>
    </div>
  );
}

function ColaView({ rows }: { rows: ColaRow[] }) {
  if (rows.length === 0) return <Vacio texto="No hay reembolsos pendientes de reintento." />;
  return (
    <div className="overflow-x-auto rounded-xl bg-white" style={{ border: "1px solid #e5e7eb" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            <Th>Paciente</Th><Th>Médico</Th><Th>Monto</Th><Th>Bloqueo</Th>
            <Th className="hidden lg:table-cell">Intentos</Th>
            <Th className="hidden lg:table-cell">Próximo reintento</Th>
            <Th className="hidden lg:table-cell">Desde</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const badge = ESTADO_BADGE[r.estado] ?? { status: r.estado, label: r.estado };
            return (
              <tr key={r.id} className="border-b border-gray-50 last:border-0">
                <Td>
                  <span className="font-medium text-gray-900">{r.paciente}</span>
                  <span className="ml-1.5 text-[10px] uppercase text-gray-400">{r.tipo}</span>
                  {r.motivo && <p className="mt-0.5 text-xs text-gray-400">{r.motivo}</p>}
                </Td>
                <Td>{r.medico}</Td>
                <Td className="font-medium text-gray-900">{money(r.monto)}</Td>
                <Td><StatusBadge status={badge.status} label={badge.label} /></Td>
                <Td className="hidden lg:table-cell">{r.intentos}</Td>
                <Td className="hidden text-gray-500 lg:table-cell">{fechaCorta(r.proximo_intento_at)}</Td>
                <Td className="hidden text-gray-400 lg:table-cell">{desdeHace(r.creado_at)}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AccionView({ rows }: { rows: AccionRow[] }) {
  if (rows.length === 0) return <Vacio texto="No hay reembolsos que requieran acción manual." />;
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-[#FFF3E0] px-4 py-2.5 text-xs" style={{ borderLeft: "3px solid #D85A30" }}>
        <span style={{ color: "#7A3A1A" }}>
          Estos reembolsos se escalaron tras 48hs sin saldo del médico. <strong>Docto debe cubrir al paciente por transferencia CVU.</strong> La captura del CVU del paciente llega en el ticket 3A; por ahora coordinar el dato manualmente.
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl bg-white" style={{ border: "1px solid #e5e7eb" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <Th>Paciente</Th><Th>Médico</Th><Th>Monto a cubrir</Th><Th>CVU paciente</Th><Th>Desde</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0">
                <Td>
                  <span className="font-medium text-gray-900">{r.paciente}</span>
                  <span className="ml-1.5 text-[10px] uppercase text-gray-400">{r.tipo}</span>
                </Td>
                <Td>{r.medico}</Td>
                <Td className="font-medium text-gray-900">{money(r.monto)}</Td>
                <Td>
                  {r.cvu
                    ? <span className="font-mono text-xs text-gray-700">{r.cvu}</span>
                    : <span className="text-xs text-gray-400">— pendiente (3A)</span>}
                </Td>
                <Td className="text-gray-400">{desdeHace(r.creado_at)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeudaView({ rows }: { rows: DeudaRow[] }) {
  if (rows.length === 0) return <Vacio texto="Ningún médico tiene deuda pendiente." />;
  return (
    <div className="overflow-x-auto rounded-xl bg-white" style={{ border: "1px solid #e5e7eb" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            <Th>Médico</Th><Th>Deuda total</Th><Th>Recuperado</Th><Th>Restante</Th><Th>Casos</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.medico_id} className="border-b border-gray-50 last:border-0">
              <Td className="font-medium text-gray-900">{r.medico}</Td>
              <Td>{money(r.total_debe)}</Td>
              <Td className={r.total_recuperado > 0 ? "text-[#1D9E75]" : "text-[#888780]"}>{money(r.total_recuperado)}</Td>
              <Td className="font-medium text-gray-900">{money(r.restante)}</Td>
              <Td className="text-gray-400">{r.items}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-400 ${className}`}>{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
