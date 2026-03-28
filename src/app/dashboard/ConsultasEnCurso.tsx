"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Consulta = {
  id: string;
  especialidad: string;
  paciente_nombre: string;
  paciente_tabla_id: string | null;
  sala_video_url: string | null;
  motivo_consulta: string | null;
  sintomas: string[] | null;
  created_at: string;
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

function tiempoTranscurrido(fecha: string): string {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "recién iniciada";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

function formatHoraAR(fecha: string): string {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export default function ConsultasEnCurso({
  consultas: consultasIniciales,
  medicoId,
}: {
  consultas: Consulta[];
  medicoId: string;
}) {
  const router = useRouter();
  const [consultas, setConsultas] = useState(consultasIniciales);
  const [creando, setCreando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConsultas(consultasIniciales);
  }, [consultasIniciales]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      channel = supabase
        .channel(`en-curso-${medicoId}-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "consultas" },
          async (payload) => {
            const updated = payload.new as {
              id: string;
              medico_id: string;
              estado: string;
              especialidad: string;
              sala_video_url: string | null;
              paciente_id: string;
              motivo_consulta: string | null;
              sintomas: string[] | null;
              created_at: string;
            };
            if (updated.medico_id !== medicoId) return;

            if (updated.estado === "en_curso") {
              setConsultas((prev) => {
                const exists = prev.find((c) => c.id === updated.id);
                if (exists) {
                  return prev.map((c) =>
                    c.id === updated.id
                      ? { ...c, sala_video_url: updated.sala_video_url }
                      : c
                  );
                }
                return prev;
              });

              const { data: paciente } = await supabase
                .from("pacientes")
                .select("id, nombre_completo, fecha_nacimiento")
                .eq("user_id", updated.paciente_id)
                .single();

              setConsultas((prev) => {
                if (prev.some((c) => c.id === updated.id)) return prev;
                return [
                  ...prev,
                  {
                    id: updated.id,
                    especialidad: updated.especialidad,
                    paciente_nombre: paciente?.nombre_completo ?? "Paciente",
                    paciente_tabla_id: paciente?.id ?? null,
                    sala_video_url: updated.sala_video_url,
                    motivo_consulta: updated.motivo_consulta,
                    sintomas: updated.sintomas,
                    created_at: updated.created_at,
                    fecha_nacimiento: paciente?.fecha_nacimiento ?? null,
                  },
                ];
              });
            }

            if (updated.estado === "completada" || updated.estado === "cancelada") {
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

  async function handleIniciar(consultaId: string) {
    setCreando(consultaId);
    setError(null);
    try {
      const res = await fetch("/api/videollamada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId }),
      });
      const data = await res.json();

      if (!data.url) {
        setError(data.error || "Error al crear la videollamada.");
        setCreando(null);
        return;
      }

      setConsultas((prev) =>
        prev.map((c) =>
          c.id === consultaId ? { ...c, sala_video_url: data.url } : c
        )
      );
      setCreando(null);
      router.push(`/consulta/${consultaId}/video`);
    } catch {
      setError("Error de conexión.");
      setCreando(null);
    }
  }

  if (consultas.length === 0) return null;

  return (
    <div className="space-y-4">
      {consultas.map((c) => {
        const edad = calcularEdad(c.fecha_nacimiento);
        const transcurrido = tiempoTranscurrido(c.created_at);

        return (
          <div
            key={c.id}
            className="rounded-xl bg-white p-6"
            style={{ border: "0.5px solid #e5e7eb" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#1D9E75]" />
                <span className="text-xs font-medium tracking-wide text-[#1D9E75]">
                  EN CURSO
                </span>
              </div>
              {transcurrido && (
                <span className="text-xs text-gray-400">{transcurrido}</span>
              )}
            </div>

            {/* Patient info */}
            {c.paciente_tabla_id ? (
              <a href={`/medico/paciente/${c.paciente_tabla_id}`} className="mt-4 block text-2xl font-medium text-gray-900 hover:text-[#1D9E75]" style={{ fontSize: "28px", lineHeight: "34px" }}>
                {c.paciente_nombre}
              </a>
            ) : (
              <p className="mt-4 text-2xl font-medium text-gray-900" style={{ fontSize: "28px", lineHeight: "34px" }}>
                {c.paciente_nombre}
              </p>
            )}
            <p className="mt-1 text-sm text-gray-400">
              {[edad, c.especialidad].filter(Boolean).join(" · ")}
            </p>

            {/* Síntomas */}
            {c.sintomas && c.sintomas.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {c.sintomas.map((s) => (
                  <span
                    key={s}
                    className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-500"
                    style={{ border: "0.5px solid #e5e7eb" }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}

            {/* Motivo */}
            {c.motivo_consulta && (
              <p className="mt-3 text-sm text-gray-600">
                {c.motivo_consulta}
              </p>
            )}

            {/* Error */}
            {error && (
              <p className="mt-3 text-xs text-red-500">{error}</p>
            )}

            {/* Action */}
            <div className="mt-5 flex justify-end">
              {c.sala_video_url ? (
                <a
                  href={`/consulta/${c.id}/video`}
                  className="rounded-lg bg-[#1D9E75] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#178a64]"
                >
                  Unirse a la videollamada
                </a>
              ) : (
                <button
                  disabled={creando === c.id}
                  onClick={() => handleIniciar(c.id)}
                  className="rounded-lg bg-[#1D9E75] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#178a64] disabled:opacity-50"
                >
                  {creando === c.id ? "Creando sala..." : "Iniciar videollamada"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
