"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin } from "lucide-react";
import { capitalizarNombre } from "@/lib/utils/texto";
import { trackFunnel } from "@/lib/funnel-client";
import {
  type Medico,
  type ConsultaEspera,
  type TurnoClinicaVirtual,
  puedeAtenderAhora,
  semaforoEspera,
  proximoTurnoPorMedico,
  formatFechaTurno,
  formatPrecio,
  normalizeTexto,
  ordenarMedicos,
} from "./disponibilidad";

// Pantalla 2 del ruteo (diseño Sofía): listado PLANO de médicos habilitados para la
// jurisdicción del paciente. Reemplaza la grilla de especialidades como landing. Reúsa la
// fila de médico y toda la lógica de disponibilidad (semáforo, cola, R2, orden). La
// especialidad pasa de navegación a buscador. Estado vacío = captura de lead (primer nivel).
export default function ListadoMedicos({
  provincia,
  medicos,
  consultasEspera,
  turnosClinicaVirtual,
  medicosEnTurno,
  flagCiActiva,
  flagTurnosActivos,
  onCambiarProvincia,
}: {
  provincia: string;
  medicos: Medico[]; // ya filtrados por jurisdicción (fail-safe aplicado antes)
  consultasEspera: ConsultaEspera[];
  turnosClinicaVirtual: TurnoClinicaVirtual[];
  medicosEnTurno: string[];
  flagCiActiva: boolean;
  flagTurnosActivos: boolean;
  onCambiarProvincia: () => void;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [emailLead, setEmailLead] = useState("");
  const [leadEnviado, setLeadEnviado] = useState(false);

  // Polling cada 15s: mantiene el semáforo vivo sin refresh manual (regla del proyecto:
  // no depender solo de Realtime). Conserva el comportamiento de la grilla anterior.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => { trackFunnel("clinica_vista"); }, []);

  const habilitadosIdentidad = useMemo(
    () => new Set(medicos.filter((m) => m.habilitadoIdentidad).map((m) => m.id)),
    [medicos]
  );
  const medicosConTurnos = useMemo(
    () => new Set(turnosClinicaVirtual.filter((t) => habilitadosIdentidad.has(t.medico_id)).map((t) => t.medico_id)),
    [turnosClinicaVirtual, habilitadosIdentidad]
  );
  const turnoMasCercano = useMemo(() => proximoTurnoPorMedico(turnosClinicaVirtual), [turnosClinicaVirtual]);
  const esperasPorMedico = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of consultasEspera) m.set(c.medico_id, (m.get(c.medico_id) ?? 0) + 1);
    return m;
  }, [consultasEspera]);
  const medicosEnTurnoSet = useMemo(() => new Set(medicosEnTurno), [medicosEnTurno]);

  // Búsqueda por especialidad o nombre. Luego orden macro por disponibilidad.
  const termino = normalizeTexto(busqueda.trim());
  const filtrados = termino
    ? medicos.filter((m) => normalizeTexto(m.especialidad).includes(termino) || normalizeTexto(m.nombre_completo).includes(termino))
    : medicos;
  const ordenados = ordenarMedicos(filtrados, esperasPorMedico, turnoMasCercano, medicosConTurnos);

  function elegirCI(m: Medico) {
    trackFunnel("medico_elegido", { medicoId: m.id, modo: "ci", especialidad: m.especialidad });
    router.push(`/triage?medicoId=${encodeURIComponent(m.id)}&especialidad=${encodeURIComponent(m.especialidad)}`);
  }

  const chip = (
    <div className="mb-5 inline-flex items-center gap-1.5 text-[14px]">
      <MapPin size={15} strokeWidth={1.75} style={{ color: "#888780" }} />
      <span className="font-medium text-gray-700">{provincia}</span>
      <span className="text-gray-300">·</span>
      <button type="button" onClick={onCambiarProvincia} className="font-medium text-[#378ADD] underline">
        cambiar
      </button>
    </div>
  );

  // ── Estado vacío: no hay médicos habilitados en la provincia (captura de lead). ──
  if (medicos.length === 0) {
    return (
      <div className="mx-auto max-w-md px-5 py-8">
        <h1 className="text-[22px] font-bold text-gray-900">Médicos habilitados para tu jurisdicción</h1>
        <div className="mt-3">{chip}</div>
        <div className="mt-4 rounded-xl bg-white p-6 text-center" style={{ border: "1px solid #e5e7eb" }}>
          <p className="text-[18px] font-semibold text-gray-900">
            Todavía no tenemos médicos habilitados en {provincia}.
          </p>
          {leadEnviado ? (
            <p className="mt-4 text-[15px] font-medium" style={{ color: "#1D9E75" }}>
              Listo. Te escribimos apenas haya un médico en {provincia}.
            </p>
          ) : (
            <>
              <p className="mt-2 text-[15px] leading-relaxed text-gray-500">
                Estamos sumando médicos nuevos cada semana. Dejanos tu email y te avisamos apenas haya uno para vos.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <input
                  type="email"
                  value={emailLead}
                  onChange={(e) => setEmailLead(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full rounded-lg px-3 py-3 text-[16px] focus:outline-none"
                  style={{ border: "1px solid #d1d5db", color: "#111827" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#378ADD"; e.currentTarget.style.boxShadow = "0 0 0 1px #378ADD"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }}
                />
                <button
                  type="button"
                  onClick={() => { if (emailLead.trim()) { trackFunnel("medico_elegido", { medicoId: "sin-oferta", modo: "lead", especialidad: provincia }); setLeadEnviado(true); } }}
                  className="h-12 w-full rounded-lg text-[16px] font-semibold text-white active:scale-[0.98]"
                  style={{ backgroundColor: "#378ADD" }}
                >
                  Avisarme
                </button>
              </div>
            </>
          )}
          <button type="button" onClick={onCambiarProvincia} className="mt-5 text-[14px] font-medium text-[#378ADD] underline">
            ¿Estás en otra provincia? Cambiar jurisdicción
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-[22px] font-bold text-gray-900">Médicos habilitados para tu jurisdicción</h1>
      <p className="mt-1 text-[14px] text-gray-500">
        {medicos.length} {medicos.length === 1 ? "médico habilitado" : "médicos habilitados"} en {provincia}
      </p>
      <div className="mt-3">{chip}</div>

      {(!flagCiActiva || !flagTurnosActivos) && (
        <div className="mb-4 rounded-lg bg-[#BA7517]/10 px-4 py-3 text-center text-[13px] text-[#BA7517]" style={{ border: "1px solid #BA751730" }}>
          {!flagCiActiva ? "La Consulta Inmediata está en pausa por unos minutos. Podés agendar un turno." : "Estamos actualizando la agenda. La reserva de turnos vuelve en breve."}
        </div>
      )}

      <div className="relative mb-4">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          <Search size={16} strokeWidth={1.75} style={{ color: "#9ca3af" }} />
        </span>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por especialidad"
          className="w-full rounded-lg bg-white py-3 pl-10 pr-4 text-[15px] shadow-sm focus:outline-none"
          style={{ border: "1px solid #d1d5db", color: "#111827" }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#378ADD"; e.currentTarget.style.boxShadow = "0 0 0 1px #378ADD"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "none"; }}
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-4 text-[13px] text-gray-600">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "#1D9E75" }} />Disponible ahora</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "#BA7517" }} />Con espera</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "#D85A30" }} />Solo programada</span>
      </div>

      {ordenados.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-gray-500">No encontramos médicos para “{busqueda}”.</p>
      ) : (
        <div className="space-y-3">
          {ordenados.map((m) => {
            const enEspera = esperasPorMedico.get(m.id) ?? 0;
            const disponibleAhora = puedeAtenderAhora(m);
            const tieneTurno = medicosConTurnos.has(m.id);
            const esperaInfo = medicosEnTurnoSet.has(m.id) ? { color: "#BA7517", texto: "Con un paciente" } : semaforoEspera(enEspera);
            const proxTurno = turnoMasCercano.get(m.id);
            return (
              <div
                key={m.id}
                className={`flex items-center justify-between rounded-xl bg-white p-4 ${disponibleAhora ? "" : "opacity-70"}`}
                style={{ border: "1px solid #e5e7eb" }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {m.foto_url ? (
                    <div className="h-12 w-12 shrink-0 rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${m.foto_url})`, backgroundColor: "#f0f0f0", boxShadow: "inset 0 0 0 1px #e5e7eb" }} />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold" style={{ backgroundColor: "#f0f0f0", color: "#666", boxShadow: "inset 0 0 0 1px #e5e7eb" }}>
                      {m.nombre_completo.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[15px] font-medium text-gray-900">{capitalizarNombre(m.nombre_completo)}</p>
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: disponibleAhora ? "#1D9E75" : "#e5e7eb" }} />
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-gray-500">{m.especialidad}</p>
                    <p className="mt-0.5 text-[13px] font-medium" style={{ color: disponibleAhora ? esperaInfo.color : m.ciBloqueadaPorTurno ? "#BA7517" : tieneTurno && proxTurno ? "#374151" : "#9ca3af" }}>
                      {disponibleAhora
                        ? esperaInfo.texto
                        : m.ciBloqueadaPorTurno
                          ? "Atendiendo un turno ahora"
                          : tieneTurno && proxTurno
                            ? `Próximo turno: ${formatFechaTurno(proxTurno.fecha, proxTurno.hora_inicio)}`
                            : "No disponible ahora"}
                    </p>
                    <p className="mt-0.5 text-[12px] text-gray-400">{formatPrecio(m.precio_consulta)} · {m.duracion_consulta} min</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {flagCiActiva && (
                    <button
                      disabled={!disponibleAhora}
                      onClick={() => elegirCI(m)}
                      className="rounded-lg px-3 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.97]"
                      style={{ backgroundColor: disponibleAhora ? "#378ADD" : "#c9c9c7" }}
                    >
                      Consulta ahora
                    </button>
                  )}
                  {tieneTurno && flagTurnosActivos && (
                    <a
                      href={`/clinica/${m.id}/turnos`}
                      onClick={() => trackFunnel("medico_elegido", { medicoId: m.id, modo: "turno" })}
                      className="rounded-lg px-3 py-2 text-center text-[13px] font-medium transition-colors hover:bg-[#f0f0f0]"
                      style={{ backgroundColor: "#f5f5f4", color: "#57534e" }}
                    >
                      Agendar turno
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
