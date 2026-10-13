"use client";

// El término aparte de medicamentos controlados, con su propio tilde.
// Un solo componente para el paciente (triage, reserva del turno) y el
// profesional (registro, aviso del panel): el texto sale de lib/legal/controlados
// y es el mismo que queda sembrado en la base con su versión.

import { CONTROLADOS_TITULO, CONTROLADOS_TEXTO, CONTROLADOS_CASILLA } from "@/lib/legal/controlados-texto";

export default function TerminoControlados({
  aceptado,
  onChange,
  tamano = "normal",
}: {
  aceptado: boolean;
  onChange: (valor: boolean) => void;
  tamano?: "normal" | "chico";
}) {
  const chico = tamano === "chico";
  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${chico ? "p-3" : "p-4"}`}>
      <p className={`font-semibold text-gray-900 ${chico ? "text-xs" : "text-sm"}`}>{CONTROLADOS_TITULO}</p>
      <p className={`mt-1 text-gray-600 ${chico ? "text-[11px]" : "text-sm"}`}>{CONTROLADOS_TEXTO}</p>
      <label className="mt-2 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={aceptado}
          onChange={(e) => onChange(e.target.checked)}
          className={`mt-0.5 rounded border-gray-300 ${chico ? "h-4 w-4" : "h-5 w-5"}`}
          aria-label={`${CONTROLADOS_CASILLA}: ${CONTROLADOS_TITULO}`}
        />
        <span className={`text-gray-700 ${chico ? "text-xs" : "text-sm"}`}>{CONTROLADOS_CASILLA}</span>
      </label>
    </div>
  );
}
