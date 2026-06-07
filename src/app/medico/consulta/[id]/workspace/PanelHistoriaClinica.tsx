"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { EntradaEvolucion } from "@/app/medico/paciente/[pacienteId]/EvolucionesTimeline";

// ---------------------------------------------------------------------------
// PanelHistoriaClinica — variante COMPACTA del timeline de evoluciones para el
// workspace del médico (durante la consulta). Read-only, densidad mobile.
//
// Pila de entradas previas del MISMO paciente (CI + turnos completados con
// evolución), ordenadas nueva→vieja. Cada entrada arranca colapsada (solo
// evolución + fecha + badge de canal opcional); tap expande la entrada entera
// mostrando diagnóstico / receta / indicaciones de esa visita.
//
// La Orden médica NO se muestra acá (no es parte de la HC clínica).
// NO reusa el render de EvolucionesTimeline (ese es para la ficha, más denso);
// sí reusa el tipo `EntradaEvolucion`.
// ---------------------------------------------------------------------------

function EntradaCompacta({ e }: { e: EntradaEvolucion }) {
  const [abierta, setAbierta] = useState(false);

  // Resumen colapsado de la evolución (1-2 líneas). Si no hay evolución,
  // caemos a un texto neutro para que la fila siga siendo tappeable.
  const resumen = e.evolucion?.trim() || "Sin evolución registrada";

  return (
    <div
      className="rounded-lg bg-white"
      style={{ border: "0.5px solid #e5e7eb", borderLeft: `3px solid ${e.canalColor}` }}
    >
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left"
        style={{ minHeight: 44 }}
        aria-expanded={abierta}
      >
        <div className="min-w-0">
          {/* Fecha + badge canal */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{e.fechaLabel}</span>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${e.canalColor}14`, color: e.canalColor }}
            >
              {e.canalLabel}
            </span>
          </div>
          {/* Evolución (resumen colapsado / completa al abrir) */}
          <p
            className={`mt-1 text-sm text-gray-900 ${abierta ? "whitespace-pre-line" : "line-clamp-2"}`}
            style={{ lineHeight: 1.5 }}
          >
            {resumen}
          </p>
        </div>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0 transition-transform"
          style={{ color: "#888780", transform: abierta ? "rotate(180deg)" : "none" }}
        />
      </button>

      {/* Detalle de la visita — diagnóstico / receta / indicaciones */}
      {abierta && (
        <div className="space-y-3 px-4 pb-3.5" style={{ borderTop: "0.5px solid #f1f1f1" }}>
          {e.diagnostico && (
            <div className="pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Diagnóstico
              </p>
              <p className="mt-0.5 text-sm text-gray-700">{e.diagnostico}</p>
            </div>
          )}
          <div className={e.diagnostico ? "" : "pt-3"}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Receta
            </p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-gray-700">
              {e.medicacion?.trim() || "Sin receta"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Indicaciones
            </p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-gray-700">
              {e.indicaciones?.trim() || "Sin indicaciones"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PanelHistoriaClinica({ entradas }: { entradas: EntradaEvolucion[] }) {
  return (
    <div className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        HISTORIA CLÍNICA
      </p>

      {entradas.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-400">
          Primera consulta con este paciente.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {entradas.map((e) => (
            <EntradaCompacta key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}
