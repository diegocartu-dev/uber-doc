"use client";

import { useState } from "react";

type LayoutMode = "normal" | "calendario" | "modelos";

const proporciones: Record<LayoutMode, string> = {
  normal: "3fr 2fr",
  calendario: "1fr 2fr",
  modelos: "2fr 1fr",
};

const labels: Record<LayoutMode, string> = {
  normal: "◆",
  calendario: "▶",
  modelos: "◀",
};

const tooltips: Record<LayoutMode, string> = {
  normal: "Expandir calendario",
  calendario: "Expandir modelos",
  modelos: "Vista normal",
};

const ciclo: Record<LayoutMode, LayoutMode> = {
  normal: "calendario",
  calendario: "modelos",
  modelos: "normal",
};

export default function LayoutAgenda({
  izquierda,
  derecha,
}: {
  izquierda: React.ReactNode;
  derecha: React.ReactNode;
}) {
  const [modo, setModo] = useState<LayoutMode>("normal");

  return (
    <div className="relative mt-6 gap-6 md:grid" style={{ gridTemplateColumns: proporciones[modo], transition: "grid-template-columns 0.2s ease" }}>
      {/* Columna izquierda */}
      <div className="space-y-4">
        {izquierda}
      </div>

      {/* Botón toggle entre columnas — solo desktop */}
      <div className="hidden md:flex absolute left-1/2 top-0 z-10 -translate-x-1/2">
        <button
          onClick={() => setModo(ciclo[modo])}
          title={tooltips[modo]}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          style={{ border: "0.5px solid #e5e7eb", marginTop: "8px" }}
        >
          {labels[modo]}
        </button>
      </div>

      {/* Columna derecha */}
      <div className="mt-6 md:mt-0">
        {derecha}
      </div>
    </div>
  );
}
