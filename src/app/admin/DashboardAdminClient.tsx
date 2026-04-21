"use client";

import Link from "next/link";
import { Activity, Stethoscope, Users, CalendarCheck, Bell, Clock } from "lucide-react";

interface Props {
  metrics: {
    consultasHoy: number;
    medicosActivos: number;
    totalMedicos: number;
    totalPacientes: number;
    enCursoAhora: number;
    pendingMedicos: number;
    pendingAlertas: number;
  };
  diasSemana: { fecha: string; consultas: number; completadas: number }[];
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function DashboardAdminClient({ metrics, diasSemana }: Props) {
  const maxConsultas = Math.max(...diasSemana.map((d) => d.consultas), 1);

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
      </p>

      {/* Metric cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard icon={CalendarCheck} label="Consultas hoy" value={metrics.consultasHoy} color="#378ADD" />
        <MetricCard icon={Stethoscope} label="Médicos activos" value={metrics.medicosActivos} sub={`${metrics.totalMedicos} registrados`} color="#1D9E75" />
        <MetricCard icon={Users} label="Pacientes" value={metrics.totalPacientes} color="#378ADD" />
        <MetricCard icon={Activity} label="En curso ahora" value={metrics.enCursoAhora} color={metrics.enCursoAhora > 0 ? "#378ADD" : "#888780"} />
      </div>

      {/* 7 day chart */}
      <div className="mt-6 rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
        <h2 className="text-sm font-semibold text-gray-900">Últimos 7 días</h2>
        <div className="mt-4 flex items-end gap-3" style={{ height: 160 }}>
          {diasSemana.map((d) => {
            const pct = (d.consultas / maxConsultas) * 100;
            const dia = DIAS[new Date(d.fecha + "T12:00:00").getDay()];
            return (
              <div key={d.fecha} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-medium text-gray-600">{d.consultas}</span>
                <div className="w-full" style={{ height: 120 }}>
                  <div className="flex h-full items-end">
                    <div
                      className="w-full rounded-t-md bg-[#378ADD]/80 transition-all"
                      style={{ height: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                </div>
                <span className="text-[11px] text-gray-400">{dia}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-4 border-t border-gray-100 pt-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#378ADD]/80" />
            <span className="text-xs text-gray-500">Total consultas</span>
          </div>
        </div>
      </div>

      {/* Quick status */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <QuickLink
          icon={Activity}
          label="Consultas en curso"
          value={metrics.enCursoAhora}
          href="/admin/consultas"
          color="#378ADD"
        />
        <QuickLink
          icon={Clock}
          label="Médicos pendientes"
          value={metrics.pendingMedicos}
          href="/admin/medicos"
          color="#BA7517"
        />
        <QuickLink
          icon={Bell}
          label="Alertas activas"
          value={metrics.pendingAlertas}
          href="/admin/alertas"
          color="#E24B4A"
        />
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Activity; label: string; value: number; sub?: string; color: string;
}) {
  return (
    <div className="rounded-xl bg-white p-4" style={{ border: "1px solid #e5e7eb" }}>
      <div className="flex items-center gap-2">
        <Icon size={16} style={{ color }} strokeWidth={1.75} />
        <span className="text-xs font-medium text-gray-400">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function QuickLink({ icon: Icon, label, value, href, color }: {
  icon: typeof Activity; label: string; value: number; href: string; color: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-xl bg-white p-4 transition hover:shadow-sm"
      style={{ border: "1px solid #e5e7eb" }}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: `${color}15` }}>
        <Icon size={18} style={{ color }} strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-lg font-semibold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </Link>
  );
}
