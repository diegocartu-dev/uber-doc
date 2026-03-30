"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

type TurnoEspera = {
  id: string;
  fecha: string;
  hora_inicio: string;
  paciente_nombre: string;
  especialidad: string;
};

export default function TurnosEnEspera({
  turnos: turnosIniciales,
  medicoId,
}: {
  turnos: TurnoEspera[];
  medicoId: string;
}) {
  const [turnos, setTurnos] = useState(turnosIniciales);
  const [isPending, startTransition] = useTransition();

  useEffect(() => { setTurnos(turnosIniciales); }, [turnosIniciales]);

  // Realtime — SIN filtros en canal, filtrar en JS
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`turnos-espera-medico-${medicoId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "turnos" },
        async (payload) => {
          const updated = payload.new as {
            id: string; medico_id: string; estado: string;
            fecha: string; hora_inicio: string; paciente_id: string;
          };
          // Si medico_id no viene en el payload, no filtrar (aceptar todos y verificar después)
          if (updated.medico_id && updated.medico_id !== medicoId) return;

          if (updated.estado === "en_espera") {
            // Nuevo turno en espera — traer nombre paciente
            const { data: pac } = await supabase
              .from("pacientes").select("nombre_completo").eq("id", updated.paciente_id).maybeSingle();

            setTurnos((prev) => {
              if (prev.some((t) => t.id === updated.id)) return prev;
              return [...prev, {
                id: updated.id,
                fecha: updated.fecha,
                hora_inicio: updated.hora_inicio.slice(0, 5),
                paciente_nombre: pac?.nombre_completo ?? "Paciente",
                especialidad: "",
              }];
            });
          }

          if (updated.estado === "en_curso" || updated.estado === "cancelado" || updated.estado === "completado") {
            setTurnos((prev) => prev.filter((t) => t.id !== updated.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [medicoId]);

  function handleIniciar(turnoId: string) {
    startTransition(async () => {
      const supabase = createClient();
      await supabase
        .from("turnos")
        .update({ estado: "en_curso", iniciado_en: new Date().toISOString() })
        .eq("id", turnoId);

      // Crear sala de video y redirigir
      const res = await fetch("/api/videollamada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId: turnoId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = `/consulta/${turnoId}/video`;
      } else {
        window.location.href = `/consulta/${turnoId}/video`;
      }
    });
  }

  if (turnos.length === 0) return null;

  return (
    <div className="space-y-3">
      {turnos.map((t) => (
        <div
          key={t.id}
          className="rounded-xl bg-white p-5"
          style={{ border: "1px solid #1D9E75" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#1D9E75]" />
                <span className="text-xs font-medium tracking-wide text-[#1D9E75]">TURNO EN ESPERA</span>
              </div>
              <p className="mt-2 text-[15px] font-medium text-gray-900">{t.paciente_nombre}</p>
              <p className="mt-0.5 text-sm text-gray-500">
                Turno de las {t.hora_inicio.slice(0, 5)} hs
              </p>
            </div>
            <button
              onClick={() => handleIniciar(t.id)}
              disabled={isPending}
              className="shrink-0 rounded-lg bg-[#1D9E75] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#178a64] disabled:opacity-50 active:scale-95 transition-all duration-100"
            >
              {isPending ? "Iniciando..." : "Iniciar turno"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
