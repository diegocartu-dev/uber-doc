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
  const minutosTotal = (hHasta * 60 + mHasta) - (hDesde * 60 + mDesde);
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

  async function handleGuardarHorario() {
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
      setMensaje("Horario guardado");
      setTimeout(() => setMensaje(null), 2000);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Configuración de disponibilidad de atención hoy
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            {activo
              ? "Estás visible para consultas inmediatas"
              : "No estás recibiendo consultas inmediatas"}
          </p>
        </div>

        {/* Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          disabled={guardando}
          onClick={handleToggle}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
            activo ? "bg-green-500" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              activo ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Indicador de estado */}
      <div className="mt-4 flex items-center gap-2">
        <span
          className={`inline-block h-3 w-3 rounded-full ${
            activo ? "bg-green-500" : "bg-gray-300"
          }`}
        />
        <span className="text-sm font-medium text-gray-700">
          {activo ? "Disponible" : "No disponible"}
        </span>
      </div>

      {/* Ventana horaria */}
      <div className="mt-5 border-t border-gray-100 pt-5">
        <p className="text-sm font-medium text-gray-700">Ventana horaria</p>
        <p className="mt-0.5 text-xs text-gray-500">
          Fuera de este rango se desactiva automáticamente tu disponibilidad
        </p>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <label htmlFor="desde" className="block text-xs text-gray-500">
              Desde
            </label>
            <input
              id="desde"
              type="time"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <span className="mt-5 text-gray-400">—</span>
          <div className="flex-1">
            <label htmlFor="hasta" className="block text-xs text-gray-500">
              Hasta
            </label>
            <input
              id="hasta"
              type="time"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Capacidad y pacientes en espera */}
        <div className="mt-4 space-y-2">
          <p className="text-sm text-gray-700">
            <span className="font-medium">Capacidad máxima hoy:</span>{" "}
            <span className="font-semibold text-blue-600">
              {capacidad} consulta{capacidad !== 1 ? "s" : ""}
            </span>
            <span className="ml-1 text-xs text-gray-400">
              ({duracionConsulta} min c/u)
            </span>
          </p>
          <p className="text-sm text-gray-700">
            <span className="font-medium">Pacientes en espera:</span>{" "}
            <span
              className={`font-semibold ${
                pacientesEnEspera >= capacidad && capacidad > 0
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {pacientesEnEspera} / {capacidad}
            </span>
          </p>
        </div>

        <button
          onClick={handleGuardarHorario}
          disabled={guardando}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar horario"}
        </button>

        {mensaje && (
          <p
            className={`mt-2 text-sm ${
              mensaje.startsWith("Horario") ? "text-green-600" : "text-red-600"
            }`}
          >
            {mensaje}
          </p>
        )}
      </div>
    </div>
  );
}
