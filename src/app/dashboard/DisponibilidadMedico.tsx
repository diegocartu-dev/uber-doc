"use client";

import { useState, useEffect, useRef } from "react";
import { actualizarDisponibilidad, actualizarOcultoClinica, actualizarVisibleConsultorio } from "./actions";
import { useDashboardMedico } from "./DashboardMedicoProvider";
import { unlockAudio } from "@/lib/sounds";
import InputMoneda from "@/components/ui/InputMoneda";

type Props = {
  medicoId: string;
  disponibleDesde: string | null;
  disponibleHasta: string | null;
  duracionConsulta: number;
  precioConsulta: number;
  pacientesEnEspera: number;
  ocultoClinica: boolean;
  visibleConsultorioParticular: boolean;
  perfilCompleto?: boolean;
};

function calcularCapacidad(desde: string, hasta: string, duracion: number): number {
  const [hDesde, mDesde] = desde.split(":").map(Number);
  const [hHasta, mHasta] = hasta.split(":").map(Number);
  const minutosTotal = hHasta * 60 + mHasta - (hDesde * 60 + mDesde);
  if (minutosTotal <= 0) return 0;
  return Math.floor(minutosTotal / duracion);
}

export default function DisponibilidadMedico({
  medicoId,
  disponibleDesde,
  disponibleHasta,
  duracionConsulta,
  precioConsulta,
  pacientesEnEspera,
  ocultoClinica,
  visibleConsultorioParticular,
  perfilCompleto = true,
}: Props) {
  const { disponible: activo, setDisponible: setDisponibleCtx, turnosActivosHoy: bloqueado, bloquearPollDisponible } = useDashboardMedico();
  const [abierto, setAbierto] = useState(false);
  const [visibleClinica, setVisibleClinica] = useState(!ocultoClinica);
  const [visibleConsultorio, setVisibleConsultorio] = useState(visibleConsultorioParticular);
  const [guardandoCanal, setGuardandoCanal] = useState(false);
  const [desde, setDesde] = useState(disponibleDesde ?? "08:00");
  const [hasta, setHasta] = useState(disponibleHasta ?? "18:00");
  const [duracion, setDuracion] = useState(duracionConsulta);
  const [precio, setPrecio] = useState(precioConsulta);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const autoDesactivadoRef = useRef(false);

  const capacidad = calcularCapacidad(desde, hasta, duracion);

  // Validación: al menos un canal seleccionado si está activo
  const sinCanal = activo && !bloqueado && !visibleClinica && !visibleConsultorio;

  // Auto-desactivar CI solo cuando hay un turno en_curso
  useEffect(() => {
    if (bloqueado && !autoDesactivadoRef.current) {
      autoDesactivadoRef.current = true;
      setDisponibleCtx(false);
      actualizarDisponibilidad({
        disponible: false,
        disponible_desde: disponibleDesde ?? "08:00",
        disponible_hasta: disponibleHasta ?? "18:00",
      });
    }
    if (!bloqueado) {
      autoDesactivadoRef.current = false;
    }
  }, [bloqueado, disponibleDesde, disponibleHasta, setDisponibleCtx]);

  const guardandoToggleRef = useRef(false);

  async function handleToggle() {
    if (guardandoToggleRef.current) return;
    if (!perfilCompleto && !activo) return; // Can't enable without complete profile
    const nuevoEstado = !activo;
    // Activar disponibilidad es un gesto del usuario: aprovechamos para desbloquear
    // el audio en mobile (iOS exige reproducir un nodo dentro del gesto).
    if (nuevoEstado) unlockAudio();
    setDisponibleCtx(nuevoEstado);
    setGuardando(true);
    guardandoToggleRef.current = true;
    bloquearPollDisponible.current = true;
    setMensaje(null);

    const result = await actualizarDisponibilidad({
      disponible: nuevoEstado,
      disponible_desde: desde,
      disponible_hasta: hasta,
    });

    guardandoToggleRef.current = false;
    bloquearPollDisponible.current = false;
    setGuardando(false);
    if (result?.error) {
      setDisponibleCtx(!nuevoEstado);
      setMensaje(result.error);
    }
  }

  async function handleGuardar() {
    setGuardando(true);
    setMensaje(null);

    const result = await actualizarDisponibilidad({
      disponible: activo,
      disponible_desde: desde,
      disponible_hasta: hasta,
      duracion_consulta: duracion,
      precio_consulta: precio,
    });

    setGuardando(false);
    if (result?.error) {
      setMensaje(result.error);
    } else {
      setMensaje("Guardado");
      setTimeout(() => setMensaje(null), 2000);
    }
  }

  async function handleToggleClinica() {
    const nuevoEstado = !visibleClinica;
    setVisibleClinica(nuevoEstado);
    setGuardandoCanal(true);
    const result = await actualizarOcultoClinica(!nuevoEstado);
    setGuardandoCanal(false);
    if (result?.error) {
      setVisibleClinica(!nuevoEstado);
    }
  }

  async function handleToggleConsultorio() {
    const nuevoEstado = !visibleConsultorio;
    setVisibleConsultorio(nuevoEstado);
    setGuardandoCanal(true);
    const result = await actualizarVisibleConsultorio(nuevoEstado);
    setGuardandoCanal(false);
    if (result?.error) {
      setVisibleConsultorio(!nuevoEstado);
    }
  }

  const selectStyle = { border: "0.5px solid #e5e7eb" } as const;
  const selectClass =
    "appearance-none rounded-lg bg-[#f8f9fa] px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#378ADD]";

  const HORAS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
  const MINUTOS = ["00", "15", "30", "45"];

  function parseHM(val: string): [string, string] {
    const [h, m] = val.split(":");
    const mSnap = MINUTOS.reduce((prev, cur) =>
      Math.abs(parseInt(cur) - parseInt(m)) < Math.abs(parseInt(prev) - parseInt(m)) ? cur : prev
    );
    return [h ?? "08", mSnap];
  }

  const [desdeH, desdeM] = parseHM(desde);
  const [hastaH, hastaM] = parseHM(hasta);

  return (
    <div className="rounded-xl">
      {/* ── Toggle principal: Disponible para consultas ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setAbierto(!abierto)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setAbierto(!abierto); }}
        className="flex w-full cursor-pointer items-center justify-between px-5 py-3 outline-none"
      >
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-semibold"
            style={{ color: activo && !bloqueado ? "#378ADD" : "#888780" }}
          >
            {activo && !bloqueado ? "Disponible para consultas" : "No disponible"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={activo}
            disabled={guardando || bloqueado || (!perfilCompleto && !activo)}
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              bloqueado || (!perfilCompleto && !activo) ? "cursor-not-allowed bg-gray-200" : guardando ? "cursor-wait" : "cursor-pointer"
            } ${activo && !bloqueado ? "bg-[#378ADD]" : !bloqueado ? "bg-gray-300" : ""}`}
          >
            {guardando && !bloqueado ? (
              <span className={`inline-flex h-4 w-4 items-center justify-center transition-transform ${
                activo ? "translate-x-5.5" : "translate-x-0.5"
              }`}>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke={activo ? "#378ADD" : "#888780"} strokeWidth="3" opacity="0.25" />
                  <path d="M12 2a10 10 0 019.95 9" stroke={activo ? "#378ADD" : "#888780"} strokeWidth="3" strokeLinecap="round" />
                </svg>
              </span>
            ) : (
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  activo && !bloqueado ? "translate-x-5.5" : "translate-x-0.5"
                }`}
              />
            )}
          </button>
        </div>
        <span className="text-xs text-gray-400">{abierto ? "▲" : "▼"}</span>
      </div>

      {bloqueado && (
        <div className="px-5 pb-3">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-[#D85A30]">
            Tenés turnos programados para hoy. Podés activar consulta inmediata cuando los completes.
          </p>
        </div>
      )}

      {!perfilCompleto && !activo && !bloqueado && (
        <div className="px-5 pb-3">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-[#D85A30]">
            Completá tu perfil para poder activar la disponibilidad.
          </p>
        </div>
      )}

      {/* ── Checkboxes de canales (solo visibles si toggle ON) ── */}
      {activo && !bloqueado && (
        <div className="px-5 pb-3 space-y-2">
          <label className="flex items-center gap-3 cursor-pointer py-1">
            <input
              type="checkbox"
              checked={visibleClinica}
              onChange={handleToggleClinica}
              disabled={guardandoCanal}
              className="h-4.5 w-4.5 rounded border-gray-300 text-[#378ADD] focus:ring-[#378ADD]/30 disabled:opacity-50"
            />
            <div>
              <span className="text-sm text-gray-700">Clínica Virtual</span>
              <p className="text-[11px] text-gray-400">Aparecés en el listado público</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer py-1">
            <input
              type="checkbox"
              checked={visibleConsultorio}
              onChange={handleToggleConsultorio}
              disabled={guardandoCanal}
              className="h-4.5 w-4.5 rounded border-gray-300 text-[#378ADD] focus:ring-[#378ADD]/30 disabled:opacity-50"
            />
            <div>
              <span className="text-sm text-gray-700">Consultorio Particular</span>
              <p className="text-[11px] text-gray-400">Recibís pacientes via tu link directo</p>
            </div>
          </label>

          {sinCanal && (
            <p className="text-xs text-[#D85A30] mt-1 pl-7">
              Seleccioná al menos un canal para recibir pacientes.
            </p>
          )}
        </div>
      )}

      {abierto && (
        <div className="border-t border-gray-50 px-6 pb-6">
          <div className="mt-4 flex items-center gap-4">
            <div>
              <label className="text-sm text-gray-400">Desde</label>
              <div className="mt-1 flex items-center gap-1">
                <select
                  value={desdeH}
                  onChange={(e) => setDesde(`${e.target.value}:${desdeM}`)}
                  className={selectClass}
                  style={selectStyle}
                >
                  {HORAS.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <span className="text-gray-300">:</span>
                <select
                  value={desdeM}
                  onChange={(e) => setDesde(`${desdeH}:${e.target.value}`)}
                  className={selectClass}
                  style={selectStyle}
                >
                  {MINUTOS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <span className="mt-5 text-gray-300">—</span>
            <div>
              <label className="text-sm text-gray-400">Hasta</label>
              <div className="mt-1 flex items-center gap-1">
                <select
                  value={hastaH}
                  onChange={(e) => setHasta(`${e.target.value}:${hastaM}`)}
                  className={selectClass}
                  style={selectStyle}
                >
                  {HORAS.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <span className="text-gray-300">:</span>
                <select
                  value={hastaM}
                  onChange={(e) => setHasta(`${hastaH}:${e.target.value}`)}
                  className={selectClass}
                  style={selectStyle}
                >
                  {MINUTOS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Duración y valor */}
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400">Duración</label>
              <select value={duracion} onChange={(e) => setDuracion(parseInt(e.target.value))} className={`mt-1 w-full ${selectClass}`} style={selectStyle}>
                <option value={20}>20 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400">Valor de consulta</label>
              <div className="mt-1">
                <InputMoneda value={precio} onChange={setPrecio} className={`w-full ${selectClass}`} style={selectStyle} />
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-6 text-sm text-gray-500">
            <span>
              Capacidad: <span className="font-medium text-gray-700">{capacidad}</span> ({duracion} min c/u)
            </span>
            <span>
              En espera: <span className="font-medium text-gray-700">{pacientesEnEspera}/{capacidad}</span>
            </span>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleGuardar}
              disabled={guardando}
              className={`flex items-center justify-center gap-2 rounded-lg bg-[#378ADD] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2e6fb5] disabled:opacity-70`}
            >
              {guardando && (
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            {mensaje && (
              <span
                className={`text-xs ${
                  mensaje === "Guardado" ? "text-[#378ADD]" : "text-red-500"
                }`}
              >
                {mensaje}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
