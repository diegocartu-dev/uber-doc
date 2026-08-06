"use client";

// Página "Hoy" v2 (rediseño Diego 23/07): plata REAL de MP (no GMV teórico ni
// comisión hardcodeada), disponibles con jurisdicciones y CI diferenciada, sin
// la fila de métricas chicas ("no suma en nada"), y la tabla cuenta el día
// completo: pendientes + hechas con resultado, en orden cronológico.

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface HoyData {
  completadasHoy: number;
  delta: number;
  ciHoy: number;
  turnosHoy: number;
  medicosActivos: number;
  ciEsperando: number;
  cobradoHoy: number;
  comisionDocto: number;
  netoMedicos: number;
  disponiblesAhora: {
    id: string; nombre: string; especialidad: string;
    ci: boolean; turnosHoy: boolean; jurisdicciones: string[];
    desde: string | null; hasta: string | null;
  }[];
  actividad: {
    id: string; tipo: "CI" | "Turno"; canal: string | null; estado: string;
    medico: string; paciente: string; especialidad: string;
    monto: number; pagada: boolean; inicio: string;
  }[];
}

function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

function horaDe(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });
}

export default function InsightsHoyClient() {
  const [data, setData] = useState<HoyData | null>(null);
  const [loading, setLoading] = useState(true);
  const sp = useSearchParams();
  const real = sp.get("real") !== "0";

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/insights/hoy?real=${real ? 1 : 0}`);
      const json = await res.json();
      setData(json);
    } catch { /* ignore */ }
    setLoading(false);
  }, [real]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} className="animate-spin text-white/30" />
      </div>
    );
  }

  // "Pendiente" = algo que va a pasar de verdad. Una reserva en curso
  // ('reservado_pendiente') NO cuenta: es un paciente con la retención de 15 min
  // corriendo, todavía sin pagar ni agendar. Se sigue listando etiquetada
  // "reservando…" (ver EstadoBadge), pero no infla el contador. Las reservas
  // abandonadas ni siquiera llegan: las filtra la API (lib/insights/reservas.ts).
  const pendientes = data.actividad.filter(a => ["confirmado", "en_espera", "esperando", "aceptada", "pagada", "en_curso"].includes(a.estado)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-white">Hoy</h1>
        <p className="text-sm text-white/40">
          {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" })}
        </p>
      </div>

      {/* DISPONIBLES — turnos habilitados hoy y/o consulta inmediata activa */}
      {data.disponiblesAhora.length > 0 ? (
        <div className="rounded-xl bg-[#1E293B] p-4" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-white/40">Atendiendo hoy</p>
            <span className="text-xs text-white/40">{data.disponiblesAhora.length} médico(s)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.disponiblesAhora.map((m) => (
              <div key={m.id} className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 sm:max-w-[300px]">
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${m.ci ? "bg-[#1D9E75]" : "bg-white/30"}`} />
                  <span className="truncate text-sm font-medium text-white/90">{m.nombre}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-white/40">
                  {m.especialidad || "—"}
                  {m.jurisdicciones.length > 0 && (
                    <span className="text-white/60"> · {m.jurisdicciones.join(", ")}</span>
                  )}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {m.ci && (
                    <span className="rounded bg-[#1D9E75]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#1D9E75]">
                      CI activa{m.desde && m.hasta ? ` ${m.desde}–${m.hasta}` : ""}
                    </span>
                  )}
                  {m.turnosHoy && (
                    <span className="rounded bg-[#378ADD]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#378ADD]">
                      Turnos hoy
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#D85A30]/30 bg-[#D85A30]/10 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-[#D85A30]">Nadie atendiendo hoy</p>
          <p className="mt-0.5 text-xs text-white/40">Ningún médico tiene turnos habilitados ni consulta inmediata activa.</p>
        </div>
      )}

      {/* Las 3 preguntas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Crecimiento */}
        <div className="rounded-xl bg-[#1E293B] p-6" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">¿Estamos creciendo?</p>
          <p className="mt-3 font-['Space_Grotesk'] text-4xl font-bold text-white">
            {data.completadasHoy}
          </p>
          <p className="mt-1 text-sm text-white/50">consultas completadas hoy</p>
          <div className="mt-3 flex items-center gap-2">
            {data.delta > 0 ? (
              <><TrendingUp size={16} color="#1D9E75" /><span className="text-sm font-medium text-[#1D9E75]">+{data.delta} vs hace 7 días</span></>
            ) : data.delta < 0 ? (
              <><TrendingDown size={16} color="#D85A30" /><span className="text-sm font-medium text-[#D85A30]">{data.delta} vs hace 7 días</span></>
            ) : (
              <><Minus size={16} color="#888780" /><span className="text-sm font-medium text-white/40">igual que hace 7 días</span></>
            )}
          </div>
          <div className="mt-3 flex gap-3 text-xs text-white/40">
            <span>CI: {data.ciHoy}</span>
            <span>Turnos: {data.turnosHoy}</span>
          </div>
        </div>

        {/* Oferta vs demanda */}
        <div className="rounded-xl bg-[#1E293B] p-6" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">¿Oferta vs demanda?</p>
          <p className="mt-3 font-['Space_Grotesk'] text-4xl font-bold text-white">
            {data.medicosActivos}
          </p>
          <p className="mt-1 text-sm text-white/50">médicos con CI activa ahora</p>
          <p className="mt-3 text-sm text-white/40">
            {data.ciEsperando} pacientes en espera CI
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: data.ciEsperando === 0 ? "#1D9E75" : data.ciEsperando <= 3 ? "#BA7517" : "#D85A30" }} />
            <span className="text-sm text-white/50">
              {data.ciEsperando === 0 ? "OK" : data.ciEsperando <= 3 ? "Monitorear" : "Demanda alta"}
            </span>
          </div>
        </div>

        {/* Plata REAL */}
        <div className="rounded-xl bg-[#1E293B] p-6" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">¿La plata cierra?</p>
          <p className="mt-3 font-['Space_Grotesk'] text-4xl font-bold text-white">
            {formatARS(data.cobradoHoy)}
          </p>
          <p className="mt-1 text-sm text-white/50">cobrado hoy · pagos aprobados en MP</p>
          <div className="mt-3 rounded-lg bg-[#378ADD]/10 px-3 py-2">
            <p className="text-sm font-medium text-[#378ADD]">
              Docto {formatARS(data.comisionDocto)}
            </p>
            <p className="text-xs text-[#378ADD]/60">
              comisión real de MP · médicos {formatARS(data.netoMedicos)}
            </p>
          </div>
        </div>
      </div>

      {/* El día completo: pendientes + hechas */}
      <div className="rounded-xl bg-[#1E293B]" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="text-sm font-semibold text-white/80">Atenciones de hoy</h2>
          {pendientes > 0 && (
            <span className="rounded bg-[#BA7517]/20 px-2 py-0.5 text-xs font-medium text-[#BA7517]">
              {pendientes} pendiente(s)
            </span>
          )}
        </div>
        {data.actividad.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/30">Sin atenciones ni turnos reservados para hoy</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-white/30">
                  <th className="px-5 py-3">Hora</th>
                  <th className="px-5 py-3">Médico</th>
                  <th className="hidden px-5 py-3 sm:table-cell">Paciente</th>
                  <th className="hidden px-5 py-3 lg:table-cell">Especialidad</th>
                  <th className="px-5 py-3">Canal</th>
                  <th className="hidden px-5 py-3 sm:table-cell">Pagado</th>
                  <th className="px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.actividad.map((a) => (
                  <tr key={`${a.tipo}-${a.id}`} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3 text-white/60">{horaDe(a.inicio)}</td>
                    <td className="max-w-[140px] truncate px-5 py-3 font-medium text-white/90">{a.medico}</td>
                    <td className="hidden max-w-[140px] truncate px-5 py-3 text-white/60 sm:table-cell">{a.paciente}</td>
                    <td className="hidden px-5 py-3 text-white/40 lg:table-cell">{a.especialidad || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        a.tipo === "CI"
                          ? "bg-[#378ADD]/20 text-[#378ADD]"
                          : a.canal === "consultorio_privado"
                            ? "bg-[#BA7517]/20 text-[#BA7517]"
                            : "bg-white/10 text-white/60"
                      }`}>
                        {a.tipo === "CI" ? "CI" : a.canal === "consultorio_privado" ? "Turno consult." : "Turno clínica"}
                      </span>
                    </td>
                    <td className="hidden px-5 py-3 sm:table-cell">
                      {a.pagada ? (
                        <span className="text-white/70">{formatARS(a.monto)}</span>
                      ) : (
                        <span className="text-white/30">{a.monto ? `${formatARS(a.monto)} · sin pago` : "—"}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <EstadoBadge estado={a.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Estados en criollo: qué pasó (o va a pasar) con esa atención.
function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    completada: { label: "completada", cls: "bg-[#1D9E75]/20 text-[#1D9E75]" },
    completado: { label: "completado", cls: "bg-[#1D9E75]/20 text-[#1D9E75]" },
    en_curso: { label: "en curso", cls: "bg-[#378ADD]/20 text-[#378ADD]" },
    esperando: { label: "esperando al médico", cls: "bg-[#BA7517]/20 text-[#BA7517]" },
    aceptada: { label: "aceptada · sin pagar", cls: "bg-[#BA7517]/20 text-[#BA7517]" },
    pagada: { label: "pagada · por empezar", cls: "bg-[#BA7517]/20 text-[#BA7517]" },
    confirmado: { label: "reservado · pendiente", cls: "bg-[#BA7517]/20 text-[#BA7517]" },
    en_espera: { label: "paciente en sala", cls: "bg-[#378ADD]/20 text-[#378ADD]" },
    reservado_pendiente: { label: "reservando…", cls: "bg-white/10 text-white/50" },
    cancelada: { label: "cancelada", cls: "bg-[#E24B4A]/20 text-[#E24B4A]" },
    cancelado_paciente: { label: "canceló el paciente", cls: "bg-[#E24B4A]/20 text-[#E24B4A]" },
    cancelado_medico: { label: "canceló el médico", cls: "bg-[#E24B4A]/20 text-[#E24B4A]" },
    ausente_medico: { label: "médico ausente", cls: "bg-[#E24B4A]/20 text-[#E24B4A]" },
    ausente_paciente: { label: "paciente ausente", cls: "bg-[#E24B4A]/20 text-[#E24B4A]" },
    no_show_paciente: { label: "paciente ausente", cls: "bg-[#E24B4A]/20 text-[#E24B4A]" },
    medico_ausente: { label: "médico ausente", cls: "bg-[#E24B4A]/20 text-[#E24B4A]" },
    reprogramado: { label: "reprogramado", cls: "bg-white/10 text-white/50" },
    interrumpida: { label: "interrumpida", cls: "bg-[#E24B4A]/20 text-[#E24B4A]" },
  };
  const e = map[estado] ?? { label: estado, cls: "bg-white/10 text-white/50" };
  return (
    <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${e.cls}`}>
      {e.label}
    </span>
  );
}
