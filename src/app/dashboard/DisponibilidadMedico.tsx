"use client";

import { useState } from "react";
import { actualizarDisponibilidad } from "./actions";

type Props = {
  disponible: boolean;
  disponibleDesde: string | null;
  disponibleHasta: string | null;
  duracionConsulta: number;
  pacientesEnEspera: number;
};

function calcularCapacidad(desde: string, hasta: string, duracion: number): number {
  const [hDesde, mDesde] = desde.split(":").map(Number);
  const [hHasta, mHasta] = hasta.split(":").map(Number);
  const minutosTotal = hHasta * 60 + mHasta - (hDesde * 60 + mDesde);
  if (minutosTotal <= 0) return 0;
  return Math.floor(minutosTotal / duracion);
}

export default function DisponibilidadMedico({
  disponible,
  disponibleDesde,
  disponibleHasta,
  duracionConsulta,
  pacientesEnEspera,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(disponible);
  const [desde, setDesde] = useState(disponibleDesde ?? "08:00");
  const [hasta, setHasta] = useState(disponibleHasta ?? "18:00");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const capacidad = calcularCapacidad(desde, hasta, duracionConsulta);

  async function handleToggle() {
    const nuevoEstado = !activo;
    setActivo(nuevoEstado);
    setGuardando(true);
    setMensaje(null);

    const result = await actualizarDisponibilidad({
      disponible: nuevoEstado,
      disponible_desde: desde,
      disponible_hasta: hasta,
    });

    setGuardando(false);
    if (result?.error) {
      setActivo(!nuevoEstado);
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
    });

    setGuardando(false);
    if (result?.error) {
      setMensaje(result.error);
    } else {
      setMensaje("Guardado");
      setTimeout(() => setMensaje(null), 2000);
    }
  }

  const selectStyle = { border: "0.5px solid #e5e7eb" } as const;
  const selectClass =
    "appearance-none rounded-lg bg-[#f8f9fa] px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1D9E75]";

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
    <div
      className="rounded-xl bg-white"
      style={{ border: "0.5px solid #e5e7eb" }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setAbierto(!abierto)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setAbierto(!abierto); }}
        className="flex w-full cursor-pointer items-center justify-between px-6 py-4"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium tracking-wide text-gray-400">
            DISPONIBILIDAD
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={activo}
            disabled={guardando}
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
              activo ? "bg-[#1D9E75]" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                activo ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        <span className="text-xs text-gray-400">{abierto ? "▲" : "▼"}</span>
      </div>

      {abierto && (
        <div className="border-t border-gray-50 px-6 pb-6">
          <div className="mt-4 flex items-center gap-4">
            <div>
              <label className="text-xs text-gray-400">Desde</label>
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
              <label className="text-xs text-gray-400">Hasta</label>
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

          <div className="mt-4 flex items-center gap-6 text-xs text-gray-500">
            <span>
              Capacidad: <span className="font-medium text-gray-700">{capacidad}</span> ({duracionConsulta} min c/u)
            </span>
            <span>
              En espera: <span className="font-medium text-gray-700">{pacientesEnEspera}/{capacidad}</span>
            </span>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="rounded-lg bg-gray-100 px-4 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            {mensaje && (
              <span
                className={`text-xs ${
                  mensaje === "Guardado" ? "text-[#1D9E75]" : "text-red-500"
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
