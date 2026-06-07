"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export type EntradaEvolucion = {
  id: string;
  fechaLabel: string; // "07 de junio de 2026 — 14:30hs"
  especialidad: string;
  canalLabel: string; // "Consulta Inmediata" / "Consultorio privado" / ...
  canalColor: string; // color del borde izquierdo por canal
  evolucion: string | null;
  diagnostico: string | null;
  medicacion: string | null;
  indicaciones: string | null;
};

function Seccion({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      {children}
    </div>
  );
}

/**
 * En mobile, medicación e indicaciones van colapsadas tras un toggle.
 * En desktop (sm+) se muestran siempre expandidas vía clases responsive.
 */
function Colapsable({
  abierto,
  onToggle,
  resumen,
  children,
}: {
  abierto: boolean;
  onToggle: () => void;
  resumen: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Mobile: header tocable + contenido colapsado */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-2 text-left"
          style={{ minHeight: 44 }}
          aria-expanded={abierto}
        >
          <span className="truncate text-sm text-gray-500">{resumen}</span>
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            className="shrink-0 transition-transform"
            style={{ color: "#888780", transform: abierto ? "rotate(180deg)" : "none" }}
          />
        </button>
        {abierto && <div className="mt-1">{children}</div>}
      </div>

      {/* Desktop: siempre expandido */}
      <div className="hidden sm:block">{children}</div>
    </>
  );
}

function EntradaCard({ e }: { e: EntradaEvolucion }) {
  const [medAbierta, setMedAbierta] = useState(false);
  const [indAbierta, setIndAbierta] = useState(false);

  const medTexto = e.medicacion || "Sin receta";
  const indTexto = e.indicaciones || "Sin indicaciones";

  return (
    <div
      className="rounded-xl bg-white px-6 py-5"
      style={{ border: "0.5px solid #e5e7eb", borderLeft: `4px solid ${e.canalColor}` }}
    >
      <p className="text-sm font-medium text-gray-900">{e.fechaLabel}</p>
      <p className="mt-0.5 text-xs text-gray-500">
        {e.especialidad} · {e.canalLabel}
      </p>

      <div className="mt-5 space-y-4" style={{ lineHeight: "1.7" }}>
        {/* La evolución manda: primero y con más presencia */}
        {e.evolucion ? (
          <Seccion label="Evolución">
            <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-gray-900">
              {e.evolucion}
            </p>
          </Seccion>
        ) : (
          <Seccion label="Evolución">
            <p className="mt-1.5 text-sm italic text-gray-400">Sin evolución registrada</p>
          </Seccion>
        )}

        {/* Diagnóstico como sub-dato */}
        {e.diagnostico && (
          <Seccion label="Diagnóstico">
            <p className="mt-1 text-sm text-gray-700">{e.diagnostico}</p>
          </Seccion>
        )}

        {/* Medicación e indicaciones: colapsables en mobile */}
        <Seccion label="Medicación">
          <Colapsable
            abierto={medAbierta}
            onToggle={() => setMedAbierta((v) => !v)}
            resumen={e.medicacion ? "Ver medicación" : "Sin receta"}
          >
            <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{medTexto}</p>
          </Colapsable>
        </Seccion>

        <Seccion label="Indicaciones">
          <Colapsable
            abierto={indAbierta}
            onToggle={() => setIndAbierta((v) => !v)}
            resumen={e.indicaciones ? "Ver indicaciones" : "Sin indicaciones"}
          >
            <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{indTexto}</p>
          </Colapsable>
        </Seccion>
      </div>
    </div>
  );
}

export default function EvolucionesTimeline({ entradas }: { entradas: EntradaEvolucion[] }) {
  if (entradas.length === 0) return null;

  return (
    <div className="mt-8">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Evoluciones</p>
      <div className="mt-4 space-y-6">
        {entradas.map((e) => (
          <EntradaCard key={e.id} e={e} />
        ))}
      </div>
    </div>
  );
}
