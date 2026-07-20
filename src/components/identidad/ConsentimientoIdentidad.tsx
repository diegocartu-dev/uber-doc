"use client";

import { forwardRef, useId, useState } from "react";
import { CONSENTIMIENTO_IDENTIDAD_TEXTO } from "@/lib/didit/consentimiento";

// Tarjeta única de consentimiento biométrico (spec Sofía 20/07). El patrón legal
// aprobado por Carolina vive SOLO acá — registro y dashboard quedan idénticos por
// construcción. Requisito art. 7 Ley 25.326 (dato biométrico = sensible):
// consentimiento EXPRESO con el texto íntegro genuinamente disponible y a la
// vista ANTES de aceptar. El texto completo está SIEMPRE en el DOM; colapsado
// muestra las primeras líneas con degradé + "Leer el texto completo" (no es un
// link "ver términos": el texto empieza a la vista y se expande inline, sin
// scroll anidado — trampa de scroll conocida en mobile).

const AZUL = "#378ADD";
const ROJO = "#E24B4A";

// ~4 líneas de texto legal (spec: cubre el encabezado y el primer párrafo).
const ALTO_COLAPSADO = 88;

interface Props {
  aceptado: boolean;
  onAceptadoChange: (v: boolean) => void;
  /** true cuando el médico tocó el CTA sin marcar la casilla — borde y mensaje. */
  guardActiva: boolean;
}

const ConsentimientoIdentidad = forwardRef<HTMLDivElement, Props>(
  function ConsentimientoIdentidad({ aceptado, onAceptadoChange, guardActiva }, ref) {
    const [expandido, setExpandido] = useState(false);
    const legalId = useId();

    const enGuard = guardActiva && !aceptado;

    return (
      <div
        ref={ref}
        className="mt-5 rounded-xl bg-white p-4 text-left"
        style={{ border: `1px solid ${enGuard ? ROJO : "#e5e7eb"}` }}
      >
        <p className="text-sm font-semibold text-gray-900">
          Consentimiento para verificar tu identidad
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Tu selfie la procesa Didit. Docto no la recibe ni la guarda — solo el
          resultado.
        </p>

        <div className="relative mt-3">
          <div
            id={legalId}
            className="overflow-hidden whitespace-pre-line text-xs leading-relaxed text-gray-600"
            style={expandido ? undefined : { maxHeight: ALTO_COLAPSADO }}
          >
            {CONSENTIMIENTO_IDENTIDAD_TEXTO}
          </div>
          {!expandido && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
              style={{ background: "linear-gradient(transparent, #ffffff)" }}
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          aria-expanded={expandido}
          aria-controls={legalId}
          className="mt-1 min-h-[44px] text-left text-sm font-medium"
          style={{ color: AZUL }}
        >
          {expandido ? "Ocultar texto" : "Leer el texto completo"}
        </button>

        <div className="mt-3 border-t border-gray-100 pt-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={aceptado}
              onChange={(e) => onAceptadoChange(e.target.checked)}
              className="mt-0.5 h-6 w-6 shrink-0 rounded border-gray-300"
              style={{ accentColor: AZUL }}
            />
            <span className="text-left text-sm text-gray-700">
              Presto mi consentimiento expreso para que Didit verifique mi
              identidad, conforme al texto de este consentimiento.
            </span>
          </label>
          <p aria-live="polite" className="min-h-0">
            {enGuard && (
              <span className="mt-1.5 block text-xs" style={{ color: ROJO }}>
                Para continuar, marcá la casilla de consentimiento.
              </span>
            )}
          </p>
        </div>
      </div>
    );
  }
);

export default ConsentimientoIdentidad;
