"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TouchButton } from "@/components/TouchButton";
import { useDashboardMedico } from "./DashboardMedicoProvider";
import { capitalizarNombre } from "@/lib/utils/texto";

type Consulta = {
  id: string;
  especialidad: string;
  estado: string;
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
  return `${edad} a\u00f1os`;
}

function tiempoTranscurrido(fecha: string): string {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "reci\u00e9n iniciada";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export default function ConsultasEnCurso({ medicoId }: { medicoId: string }) {
  const { enCurso: consultas } = useDashboardMedico();
  const router = useRouter();
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleIniciar(consultaId: string) {
    router.push(`/medico/consulta/${consultaId}/workspace`);
  }

  async function handleCancelar(consultaId: string) {
    const confirmado = window.confirm(
      "\u00bfEst\u00e1s seguro? Si el paciente pag\u00f3, se le reembolsar\u00e1."
    );
    if (!confirmado) return;

    setCancelando(consultaId);
    setError(null);
    try {
      const res = await fetch(`/api/consulta/${consultaId}/cancelar-medico`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Error al cancelar la consulta.");
      }
    } catch {
      setError("Error de conexi\u00f3n.");
    } finally {
      setCancelando(null);
    }
  }

  if (consultas.length === 0) return null;

  return (
    <div className="space-y-4">
      {consultas.map((c) => {
        const edad = calcularEdad(c.fecha_nacimiento);
        const transcurrido = tiempoTranscurrido(c.created_at);
        const puedeVideo = c.estado === "pagada" || c.estado === "en_curso";
        const esperandoPago = c.estado === "aceptada";

        return (
          <div
            key={c.id}
            className="rounded-xl border-l-4 border-[#1D9E75] bg-white p-6"
            style={{ borderTop: "0.5px solid #e5e7eb", borderRight: "0.5px solid #e5e7eb", borderBottom: "0.5px solid #e5e7eb" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    esperandoPago ? "bg-[#D85A30]" : "animate-pulse bg-[#1D9E75]"
                  }`}
                />
                <span
                  className="text-xs font-medium tracking-wide"
                  style={{ color: esperandoPago ? "#D85A30" : "#1D9E75" }}
                >
                  {esperandoPago ? "ESPERANDO PAGO" : c.estado === "en_curso" ? "EN CURSO" : "LISTA PARA ATENDER"}
                </span>
              </div>
              {transcurrido && (
                <span className="text-xs text-gray-400">{transcurrido}</span>
              )}
            </div>

            {/* Patient info */}
            {c.paciente_tabla_id ? (
              <a href={`/medico/paciente/${c.paciente_tabla_id}`} className="mt-4 block text-2xl font-medium text-gray-900 hover:text-[#1D9E75]" style={{ fontSize: "28px", lineHeight: "34px" }}>
                {capitalizarNombre(c.paciente_nombre)}
              </a>
            ) : (
              <p className="mt-4 text-2xl font-medium text-gray-900" style={{ fontSize: "28px", lineHeight: "34px" }}>
                {capitalizarNombre(c.paciente_nombre)}
              </p>
            )}
            <p className="mt-1 text-sm text-gray-400">
              {[edad, c.especialidad].filter(Boolean).join(" \u00b7 ")}
            </p>

            {/* Sintomas */}
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
            <div className="mt-5 flex flex-col items-end gap-2">
              {esperandoPago ? (
                <p className="text-sm italic" style={{ color: "#D85A30" }}>
                  Esperando pago del paciente...
                </p>
              ) : puedeVideo ? (
                c.estado === "en_curso" ? (
                  <TouchButton
                    onClick={() => handleIniciar(c.id)}
                    className="rounded-lg bg-[#1D9E75] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#178a64]"
                  >
                    Volver al workspace
                  </TouchButton>
                ) : (
                  <TouchButton
                    onClick={() => handleIniciar(c.id)}
                    className="rounded-lg bg-[#1D9E75] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#178a64]"
                  >
                    Iniciar consulta
                  </TouchButton>
                )
              ) : null}

              {/* Cancelar consulta */}
              <button
                disabled={cancelando === c.id}
                onClick={() => handleCancelar(c.id)}
                className="text-sm font-medium disabled:opacity-50"
                style={{ color: "#E24B4A", minHeight: "44px", fontSize: "14px" }}
              >
                {cancelando === c.id ? "Cancelando..." : "Cancelar consulta"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
