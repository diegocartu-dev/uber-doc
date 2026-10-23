"use client";

import Link from "next/link";
import { Activity, Stethoscope, Users, Bell, Clock, Wallet, CalendarDays, Building2 } from "lucide-react";
import OnlineAhora from "./OnlineAhora";
import QuePaso, { type QuePasoProps } from "./QuePaso";

interface Props {
  /**
   * Estado del puente a la instancia institucional. `null` = no configurado en
   * este deploy y el bloque no se dibuja: Docto no tiene por qué ofrecer una
   * puerta a un sistema que no existe de su lado.
   */
  puente: { motivo: string | null } | null;
  metrics: {
    medicosActivos: number;
    totalMedicos: number;
    totalPacientes: number;
    pendingMedicos: number;
    pendingAlertas: number;
    reembolsosPendientes: number;
    testOcultasHoy: number;
  };
  quePaso: QuePasoProps;
  medicosDisponibles: { id: string; nombre: string; especialidad: string; clinica: boolean; consultorio: boolean; hasta: string | null; turnosHoy: number }[];
  turnosPorEspecialidad: { especialidad: string; slots: number; medicos: { id: string; nombre: string; slots: number }[] }[];
}

export default function DashboardAdminClient({ metrics, quePaso, medicosDisponibles, turnosPorEspecialidad, puente }: Props) {
  // # de médicos distintos ofertando turnos (para el resumen "de una mirada")
  const medicosOfertando = new Set(turnosPorEspecialidad.flatMap((e) => e.medicos.map((m) => m.id))).size;

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
        <span>{new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</span>
        <span className="text-gray-300">·</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          Métricas: solo cuentas reales
          {metrics.testOcultasHoy > 0 && ` · ${metrics.testOcultasHoy} de prueba ocultas hoy`}
        </span>
      </div>

      {/* Qué pasó: hoy siempre primero (Diego, 23/10/2026) */}
      <div className="mt-6">
        <QuePaso {...quePaso} />
      </div>

      {/* Metric cards */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <OnlineAhora />
        <MetricCard icon={Users} label="Pacientes" value={metrics.totalPacientes} sub={`${metrics.totalMedicos} médicos registrados`} color="#378ADD" />
      </div>

      {/* Operación en vivo: plantilla de médicos + oferta de turnos */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Médicos disponibles ahora */}
        <div className="rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Con Consulta Inmediata activa
              <span className="ml-1.5 font-normal text-gray-400">— pueden atender ahora mismo</span>
            </h2>
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
                      {m.turnosHoy > 0
                        ? ` · ${m.turnosHoy} ${m.turnosHoy === 1 ? "turno libre" : "turnos libres"} hoy`
                        : " · sin turnos libres hoy"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {m.clinica && (
                      <span
                        className="rounded-full bg-[#378ADD]/10 px-2 py-0.5 text-[11px] font-medium text-[#378ADD]"
                        title="Visible en la clínica virtual: cualquier paciente puede elegirlo"
                      >
                        En la clínica
                      </span>
                    )}
                    {m.consultorio && (
                      <span
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500"
                        title="Visible en su consultorio particular: solo por el link que él comparte"
                      >
                        Su consultorio
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Turnos disponibles por especialidad */}
        <div className="rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays size={15} strokeWidth={1.75} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Turnos libres — próximos 7 días</h2>
            </div>
            {turnosPorEspecialidad.length > 0 && (
              <span className="shrink-0 text-xs text-gray-400">
                {medicosOfertando} médico{medicosOfertando !== 1 ? "s" : ""} · {turnosPorEspecialidad.length} especialidad{turnosPorEspecialidad.length !== 1 ? "es" : ""}
              </span>
            )}
          </div>
          {turnosPorEspecialidad.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">No hay slots de turno publicados para los próximos 7 días.</p>
          ) : (
            <div className="mt-3 divide-y divide-gray-50">
              {turnosPorEspecialidad.map((e) => (
                <div key={e.especialidad} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{e.especialidad}</p>
                    <p className="shrink-0 text-xs text-gray-400">
                      <span className="text-sm font-semibold text-gray-900">{e.slots}</span> slots
                    </p>
                  </div>
                  {e.medicos.length === 1 ? (
                    // Un solo médico: nombre como subtítulo (el slot total ya está arriba)
                    <p className="mt-0.5 truncate text-xs text-gray-400">{e.medicos[0].nombre}</p>
                  ) : (
                    // 2+: una fila por médico, número alineado a la derecha para comparar de un vistazo
                    <div className="mt-1.5 space-y-1">
                      {e.medicos.map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-2 pl-3">
                          <p className="truncate text-xs text-gray-500">{m.nombre}</p>
                          <span className="shrink-0 text-xs text-gray-400">{m.slots}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick status */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
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
          label={metrics.reembolsosPendientes > 0 ? "Reembolsos pendientes" : "Reembolsos"}
          value={metrics.reembolsosPendientes}
          href="/admin/reembolsos"
          color={metrics.reembolsosPendientes > 0 ? "#E24B4A" : "#888780"}
        />
      </div>

      {puente && <AccesoInstitucional motivo={puente.motivo} />}
    </div>
  );
}

/**
 * La puerta a Docto Institucional.
 *
 * Va al final y separada del resto a propósito: no es una métrica de Docto ni
 * una sección más del panel, es el acceso a OTRO producto. Meterla entre las
 * tarjetas la volvería ruido para el uso diario del admin.
 *
 * Es un `<a>` y no un `<Link>` de Next, y eso no es un descuido: `Link`
 * prefetchea al pasar el mouse por encima, y del otro lado esto no es una
 * página sino una acción — cada visita fabrica un pasaje de un solo uso. Con
 * prefetch, pasar el cursor quemaría pasajes en silencio y el que se usa al
 * hacer clic podría llegar ya vencido.
 */
function AccesoInstitucional({ motivo }: { motivo: string | null }) {
  const problema =
    motivo === "instancia-no-responde"
      ? "La instancia no respondió. Puede estar desplegando: probá de nuevo en un minuto."
      : motivo === "sin-configurar"
        ? "El acceso todavía no está configurado en este entorno."
        : null;

  return (
    <div className="mt-8 border-t pt-6" style={{ borderColor: "#e5e7eb" }}>
      <p className="text-xs font-medium text-gray-400">Otro producto</p>

      {problema && (
        <p
          className="mt-3 rounded-lg px-3 py-2 text-xs"
          style={{ backgroundColor: "#D85A3015", color: "#D85A30" }}
          role="status"
        >
          {problema}
        </p>
      )}

      <a
        href="/api/admin/demo-institucional"
        className="mt-3 flex items-center gap-4 rounded-xl bg-white p-4 transition hover:shadow-sm"
        style={{ border: "1px solid #378ADD" }}
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: "#378ADD15" }}
        >
          <Building2 size={18} style={{ color: "#378ADD" }} strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Demo institucional</p>
          <p className="text-xs text-gray-500">Entrás con esta misma sesión, sin otra contraseña</p>
        </div>
      </a>
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
