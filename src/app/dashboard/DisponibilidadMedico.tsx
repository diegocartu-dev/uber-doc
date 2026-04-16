"use client";

import { useState, useEffect, useRef } from "react";
import { actualizarDisponibilidad, actualizarOcultoClinica } from "./actions";
import { useDashboardMedico } from "./DashboardMedicoProvider";

type Props = {
  medicoId: string;
  disponibleDesde: string | null;
  disponibleHasta: string | null;
  duracionConsulta: number;
  precioConsulta: number;
  pacientesEnEspera: number;
  ocultoClinica: boolean;
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
}: Props) {
  const { disponible: activo, setDisponible: setDisponibleCtx, turnosActivosHoy: bloqueado } = useDashboardMedico();
  const [abierto, setAbierto] = useState(false);
  const [oculto, setOculto] = useState(ocultoClinica);
  const [guardandoOculto, setGuardandoOculto] = useState(false);
  const [desde, setDesde] = useState(disponibleDesde ?? "08:00");
  const [hasta, setHasta] = useState(disponibleHasta ?? "18:00");
  const [duracion, setDuracion] = useState(duracionConsulta);
  const [precio, setPrecio] = useState(precioConsulta);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const autoDesactivadoRef = useRef(false);

  const capacidad = calcularCapacidad(desde, hasta, duracion);

  // Auto-desactivar consulta inmediata cuando hay turnos activos hoy
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

  async function handleToggle() {
    const nuevoEstado = !activo;
    setDisponibleCtx(nuevoEstado);
    setGuardando(true);
    setMensaje(null);

    const result = await actualizarDisponibilidad({
      disponible: nuevoEstado,
      disponible_desde: desde,
      disponible_hasta: hasta,
    });

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

  async function handleToggleOculto() {
    const nuevoEstado = !oculto;
    setOculto(nuevoEstado);
    setGuardandoOculto(true);
    const result = await actualizarOcultoClinica(nuevoEstado);
    setGuardandoOculto(false);
    if (result?.error) {
      setOculto(!nuevoEstado);
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
            {activo && !bloqueado ? "Activa" : "Inactiva"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={activo}
            disabled={guardando || bloqueado}
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              bloqueado ? "cursor-not-allowed bg-gray-200" : "cursor-pointer"
            } ${activo && !bloqueado ? "bg-[#378ADD]" : !bloqueado ? "bg-gray-300" : ""}`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                activo && !bloqueado ? "translate-x-5.5" : "translate-x-0.5"
              }`}
            />
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

      <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-gray-700">Visible en Clínica Virtual</span>
            <span className="text-[11px]" style={{ color: oculto ? "#888780" : "#378ADD" }}>
              {oculto ? "Oculto" : "Activo"}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!oculto}
            aria-label="Visible en Clínica Virtual"
            disabled={guardandoOculto}
            onClick={handleToggleOculto}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
              oculto ? "bg-gray-300" : "bg-[#378ADD]"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                oculto ? "translate-x-0.5" : "translate-x-5.5"
              }`}
            />
          </button>
        </div>
      </div>

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
              <div className="relative mt-1">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-gray-400">$</span>
                <input type="number" min={0} value={precio} onChange={(e) => setPrecio(parseInt(e.target.value) || 0)} className={`w-full pl-7 ${selectClass}`} style={selectStyle} />
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
              className="rounded-lg bg-[#378ADD] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2e6fb5] disabled:opacity-50"
            >
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
