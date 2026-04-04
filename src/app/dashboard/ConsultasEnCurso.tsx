"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TouchButton } from "@/components/TouchButton";
import { useDashboardMedico } from "./DashboardMedicoProvider";

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

export default function ConsultasEnCurso({ medicoId }: { medicoId: string }) {
  const { enCurso: consultas } = useDashboardMedico();
  const router = useRouter();
  const [creando, setCreando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleIniciar(consultaId: string) {
    setCreando(consultaId);
    setError(null);
    try {
      const res = await fetch("/api/videollamada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId }),
        credentials: "include",
      });
      const data = await res.json();

      if (!data.url) {
        setError(data.error || "Error al crear la videollamada.");
        setCreando(null);
        return;
      }

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
            className="rounded-xl border-l-4 border-[#1D9E75] bg-white p-6"
            style={{ borderTop: "0.5px solid #e5e7eb", borderRight: "0.5px solid #e5e7eb", borderBottom: "0.5px solid #e5e7eb" }}
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
                    className="rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-500"
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
                <TouchButton
                  href={`/consulta/${c.id}/video`}
                  className="rounded-lg bg-[#1D9E75] px-6 py-3 text-base font-medium text-white hover:bg-[#178a64]"
                >
                  Unirse a la videollamada
                </TouchButton>
              ) : (
                <TouchButton
                  disabled={creando === c.id}
                  onClick={() => handleIniciar(c.id)}
                  className="rounded-lg bg-[#1D9E75] px-6 py-3 text-base font-medium text-white hover:bg-[#178a64] disabled:opacity-50"
                >
                  {creando === c.id ? "Creando sala..." : "Iniciar videollamada"}
                </TouchButton>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
