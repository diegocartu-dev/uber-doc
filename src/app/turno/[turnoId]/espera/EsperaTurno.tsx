"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { soundConsultaAceptada, soundVideoLista } from "@/lib/sounds";

type Props = {
  turnoId: string;
  medicoNombre: string;
  medicoEspecialidad: string;
  horaInicio: string;
};

type Estado = "esperando" | "iniciando" | "redirigiendo";

export default function EsperaTurno({ turnoId, medicoNombre, medicoEspecialidad, horaInicio }: Props) {
  const [estado, setEstado] = useState<Estado>("esperando");

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("espera-turno-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "turnos" },
        (payload) => {
          const updated = payload.new as { id: string; estado: string; sala_video_url: string | null };
          if (updated.id !== turnoId) return;

          if (updated.estado === "en_curso") {
            setEstado("iniciando");
            soundConsultaAceptada();

            // Redirect automático después de 1.5s para que el paciente vea la transición
            setTimeout(() => {
              soundVideoLista();
              setEstado("redirigiendo");
              window.location.href = `/turno/${turnoId}/video`;
            }, 1500);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [turnoId]);

  // Fallback: si después de 5s en "redirigiendo" no navegó, mostrar botón
  const [mostrarFallback, setMostrarFallback] = useState(false);
  useEffect(() => {
    if (estado !== "redirigiendo") return;
    const t = setTimeout(() => setMostrarFallback(true), 5000);
    return () => clearTimeout(t);
  }, [estado]);

  return (
    <div className="text-center">
      {/* Animación de estado */}
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full" style={{ background: estado === "esperando" ? "#378ADD15" : "#1D9E7515" }}>
        {estado === "esperando" ? (
          <svg className="h-12 w-12 animate-spin" style={{ color: "#378ADD" }} viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : estado === "iniciando" ? (
          <span className="text-5xl">✅</span>
        ) : (
          <span className="text-5xl">📹</span>
        )}
      </div>

      <h1 className="mt-6 text-xl font-bold text-gray-900">
        {estado === "esperando"
          ? "Esperando al médico..."
          : estado === "iniciando"
            ? "¡Tu médico está listo!"
            : "Entrando a la videollamada..."}
      </h1>

      <p className="mt-2 text-sm text-gray-600">
        {estado === "esperando"
          ? `Esperando que el Dr. ${medicoNombre} inicie la consulta...`
          : estado === "iniciando"
            ? "Preparando la videollamada..."
            : "Redirigiendo..."}
      </p>

      {/* Info card */}
      <div className="mt-8 rounded-xl bg-white p-6 text-left" style={{ border: "0.5px solid #e5e7eb" }}>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Médico</span>
            <span className="font-medium text-gray-900">Dr. {medicoNombre}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Especialidad</span>
            <span className="font-medium text-gray-900">{medicoEspecialidad}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Hora del turno</span>
            <span className="font-medium text-gray-900">{horaInicio.slice(0, 5)} hs</span>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estado</span>
              <span
                className="font-medium"
                style={{ color: estado === "esperando" ? "#378ADD" : "#1D9E75" }}
              >
                {estado === "esperando"
                  ? "En espera"
                  : estado === "iniciando"
                    ? "Médico listo"
                    : "Videollamada lista"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Botón fallback */}
      {mostrarFallback && (
        <a
          href={`/turno/${turnoId}/video`}
          className="mt-6 block w-full rounded-xl px-6 py-3 text-center text-sm font-semibold text-white active:scale-95 active:opacity-80 transition-all duration-100"
          style={{ background: "#378ADD" }}
        >
          Unirse a la videollamada
        </a>
      )}

      <p className="mt-6 text-xs text-gray-400">
        No cierres esta pestaña
      </p>
    </div>
  );
}
