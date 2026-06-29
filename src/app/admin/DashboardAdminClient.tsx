"use client";

import Link from "next/link";
import { Activity, Stethoscope, Users, CalendarCheck, Bell, Clock, Wallet, CalendarDays } from "lucide-react";
import OnlineAhora from "./OnlineAhora";

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
  medicosDisponibles: { id: string; nombre: string; especialidad: string; clinica: boolean; consultorio: boolean; hasta: string | null }[];
  turnosPorEspecialidad: { especialidad: string; slots: number; medicos: number }[];
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function DashboardAdminClient({ metrics, diasSemana, medicosDisponibles, turnosPorEspecialidad }: Props) {
  const maxConsultas = Math.max(...diasSemana.map((d) => d.consultas), 1);

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
      </p>

      {/* Metric cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <OnlineAhora />
        <MetricCard icon={CalendarCheck} label="Consultas hoy" value={metrics.consultasHoy} color="#378ADD" />
        <MetricCard icon={Users} label="Pacientes" value={metrics.totalPacientes} sub={`${metrics.totalMedicos} médicos registrados`} color="#378ADD" />
        <MetricCard icon={Activity} label="En curso ahora" value={metrics.enCursoAhora} color={metrics.enCursoAhora > 0 ? "#378ADD" : "#888780"} />
      </div>

      {/* Operación en vivo: plantilla de médicos + oferta de turnos */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Médicos disponibles ahora */}
        <div className="rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Médicos disponibles ahora</h2>
            <span className="text-xs font-semibold" style={{ color: medicosDisponibles.length > 0 ? "#1D9E75" : "#888780" }}>
              {medicosDisponibles.length}
            </span>
          </div>
          {medicosDisponibles.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">Ningún médico tiene la consulta inmediata activa en este momento.</p>
          ) : (
            <div className="mt-3 divide-y divide-gray-50">
              {medicosDisponibles.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{m.nombre}</p>
                    <p className="text-xs text-gray-400">
                      {m.especialidad}
                      {m.hasta ? ` · hasta las ${m.hasta.slice(0, 5)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {m.clinica && (
                      <span className="rounded-full bg-[#378ADD]/10 px-2 py-0.5 text-[11px] font-medium text-[#378ADD]">Clínica</span>
                    )}
                    {m.consultorio && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">Consultorio</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Turnos disponibles por especialidad */}
        <div className="rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
          <div className="flex items-center gap-2">
            <CalendarDays size={15} strokeWidth={1.75} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Turnos libres — próximos 7 días</h2>
          </div>
          {turnosPorEspecialidad.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">No hay slots de turno publicados para los próximos 7 días.</p>
          ) : (
            <div className="mt-3 divide-y divide-gray-50">
              {turnosPorEspecialidad.map((e) => (
                <div key={e.especialidad} className="flex items-center justify-between py-2.5">
                  <p className="text-sm text-gray-700">{e.especialidad}</p>
                  <p className="text-xs text-gray-400">
                    <span className="text-sm font-semibold text-gray-900">{e.slots}</span> slots · {e.medicos} médico{e.medicos !== 1 ? "s" : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 7 day chart */}
      <div className="mt-6 rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
        <h2 className="text-sm font-semibold text-gray-900">Últimos 7 días</h2>
        <p className="mt-0.5 text-xs text-gray-400">Consultas realizadas (sólido) vs. creadas/ofertadas (tenue)</p>
        <div className="mt-4 flex items-end gap-3" style={{ height: 160 }}>
          {diasSemana.map((d) => {
            const pctTotal = (d.consultas / maxConsultas) * 100;
            const pctReal = (d.completadas / maxConsultas) * 100;
            const dia = DIAS[new Date(d.fecha + "T12:00:00").getDay()];
            return (
              <div key={d.fecha} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-semibold text-gray-700">
                  {d.completadas}<span className="font-normal text-gray-400"> / {d.consultas}</span>
                </span>
                <div className="relative w-full" style={{ height: 120 }}>
                  {/* creadas/ofertadas (tenue) */}
                  <div
                    className="absolute bottom-0 w-full rounded-t-md bg-[#378ADD]/15"
                    style={{ height: `${Math.max(pctTotal, 2)}%` }}
                  />
                  {/* realizadas (sólido) */}
                  <div
                    className="absolute bottom-0 w-full rounded-t-md bg-[#378ADD] transition-all"
                    style={{ height: `${pctReal}%` }}
                  />
                </div>
                <span className="text-[11px] text-gray-400">{dia}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-4 border-t border-gray-100 pt-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#378ADD]" />
            <span className="text-xs text-gray-500">Realizadas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#378ADD]/15" />
            <span className="text-xs text-gray-500">Creadas / ofertadas</span>
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
        <QuickLink
          icon={Wallet}
          label="Reembolsos"
          href="/admin/reembolsos"
          color="#378ADD"
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
  icon: typeof Activity; label: string; value?: number; href: string; color: string;
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
        {value !== undefined
          ? <p className="text-lg font-semibold text-gray-900">{value}</p>
          : <p className="text-lg font-semibold text-gray-900">Ver</p>}
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </Link>
  );
}
