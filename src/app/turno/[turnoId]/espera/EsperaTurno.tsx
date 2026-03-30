"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  turnoId: string;
  medicoNombre: string;
  medicoEspecialidad: string;
  horaInicio: string;
};

export default function EsperaTurno({ turnoId, medicoNombre, medicoEspecialidad, horaInicio }: Props) {
  // Realtime — SIN filtros en el canal, filtrar en JS (patrón obligatorio del proyecto)
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`espera-turno-${turnoId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "turnos" },
        (payload) => {
          const updated = payload.new as { id: string; estado: string };
          if (updated.id !== turnoId) return;

          if (updated.estado === "en_curso") {
            window.location.href = `/consulta/${turnoId}/video`;
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [turnoId]);

  return (
    <div className="text-center">
      {/* Pulso animado */}
      <div className="mx-auto flex h-20 w-20 items-center justify-center">
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: "#1D9E75", opacity: 0.2, width: "80px", height: "80px" }}
          />
          <div
            className="relative flex h-20 w-20 items-center justify-center rounded-full"
            style={{ background: "#1D9E75" }}
          >
            <span className="text-3xl text-white">🩺</span>
          </div>
        </div>
      </div>

      <h1 className="mt-8 text-xl font-medium text-gray-900">
        Tu médico te atenderá en breve
      </h1>

      <p className="mt-3 text-[15px] text-gray-700">
        Dr. {medicoNombre}
      </p>
      <p className="mt-1 text-sm text-gray-500">
        {medicoEspecialidad} · Turno de las {horaInicio.slice(0, 5)} hs
      </p>

      <div className="mt-8 rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
        <p className="text-sm text-gray-600">
          Cuando el médico inicie la consulta, vas a ser redirigido automáticamente a la videollamada.
        </p>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        No cierres esta pestaña
      </p>
    </div>
  );
}
