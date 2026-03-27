"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { aceptarConsulta } from "@/app/sala-espera/[consultaId]/actions";
import { soundPacienteEsperando } from "@/lib/sounds";

type Consulta = {
  id: string;
  especialidad: string;
  estado: string;
  created_at: string;
  paciente_nombre: string;
  motivo_consulta: string | null;
  fecha_nacimiento: string | null;
};

function calcularEdad(fechaNac: string | null): string {
  if (!fechaNac) return "";
  const hoy = new Date();
  const nac = new Date(fechaNac);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} años`;
}

function tiempoEspera(fecha: string): string {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function ConsultasPendientes({
  consultas: consultasIniciales,
  medicoId,
}: {
  consultas: Consulta[];
  medicoId: string;
}) {
  const [consultas, setConsultas] = useState(consultasIniciales);
  const [isPending, startTransition] = useTransition();
  const chimeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setConsultas(consultasIniciales);
  }, [consultasIniciales]);

  // Timbre cada 30s si hay pacientes esperando
  useEffect(() => {
    if (chimeRef.current) clearInterval(chimeRef.current);

    if (consultas.length > 0) {
      chimeRef.current = setInterval(() => {
        soundPacienteEsperando();
      }, 30000);
    }

    return () => {
      if (chimeRef.current) clearInterval(chimeRef.current);
    };
  }, [consultas.length]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      channel = supabase
        .channel(`pendientes-${medicoId}-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "consultas" },
          async (payload) => {
            const nueva = payload.new as {
              id: string;
              medico_id: string;
              especialidad: string;
              estado: string;
              created_at: string;
              paciente_id: string;
              motivo_consulta: string | null;
            };
            if (nueva.medico_id !== medicoId || nueva.estado !== "esperando") return;

            soundPacienteEsperando();

            const { data: paciente } = await supabase
              .from("pacientes")
              .select("nombre_completo, fecha_nacimiento")
              .eq("user_id", nueva.paciente_id)
              .single();

            setConsultas((prev) => {
              if (prev.some((c) => c.id === nueva.id)) return prev;
              return [
                ...prev,
                {
                  id: nueva.id,
                  especialidad: nueva.especialidad,
                  estado: nueva.estado,
                  created_at: nueva.created_at,
                  paciente_nombre: paciente?.nombre_completo ?? "Paciente",
                  motivo_consulta: nueva.motivo_consulta,
                  fecha_nacimiento: paciente?.fecha_nacimiento ?? null,
                },
              ];
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "consultas" },
          (payload) => {
            const updated = payload.new as { id: string; medico_id: string; estado: string };
            if (updated.medico_id !== medicoId) return;
            if (updated.estado !== "esperando") {
              setConsultas((prev) => prev.filter((c) => c.id !== updated.id));
            }
          }
        )
        .subscribe();
    });

    return () => {
      if (channel) createClient().removeChannel(channel);
    };
  }, [medicoId]);

  function handleAceptar(consultaId: string) {
    startTransition(async () => {
      await aceptarConsulta(consultaId);
      setConsultas((prev) => prev.filter((c) => c.id !== consultaId));
    });
  }

  if (consultas.length === 0) return null;

  return (
    <div
      className="rounded-xl bg-white p-6"
      style={{ border: "0.5px solid #e5e7eb" }}
    >
      <p className="text-xs font-medium tracking-wide text-gray-400">
        PACIENTES EN ESPERA
      </p>

      <div className="mt-4 space-y-3">
        {consultas.map((c) => {
          const edad = calcularEdad(c.fecha_nacimiento);
          const espera = tiempoEspera(c.created_at);
          const initials = getInitials(c.paciente_nombre);

          return (
            <div
              key={c.id}
              className="flex items-center gap-4 rounded-lg p-3 transition hover:bg-gray-50"
            >
              {/* Avatar */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                {initials}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="text-sm font-medium text-gray-900">
                    {c.paciente_nombre}
                  </p>
                  {edad && (
                    <span className="text-xs text-gray-400">{edad}</span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {[c.motivo_consulta, c.especialidad]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              {/* Wait time */}
              {espera && (
                <span className="shrink-0 text-xs text-gray-400">
                  {espera}
                </span>
              )}

              {/* Accept */}
              <button
                disabled={isPending}
                onClick={() => handleAceptar(c.id)}
                className="shrink-0 rounded-lg bg-gray-100 px-3.5 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
              >
                Aceptar
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
