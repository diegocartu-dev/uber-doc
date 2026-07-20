"use client";

import { useId } from "react";
import { Loader2 } from "lucide-react";

// CTA principal sticky bottom del flujo de identidad (extraído de
// PantallaIdentidad; spec Sofía 20/07). Decisión central del respec: el botón
// SIEMPRE es sólido — nunca se atenúa ni se deshabilita por falta de checkbox
// (un CTA que parece muerto fue la causa directa de los abandonos con
// didit_status null; además Safari iOS no dispara click en disabled). La guarda
// vive en el onClick del caller: scroll + resaltado de lo que falta.

const AZUL = "#378ADD";
const ROJO = "#E24B4A";

interface Props {
  label: string;
  onClick: () => void;
  cargando: boolean;
  error: string | null;
  /** Línea fija arriba del botón (ej. aviso de salida a Didit). */
  aviso?: string;
  loadingLabel?: string;
}

export default function CtaSticky({
  label,
  onClick,
  cargando,
  error,
  aviso,
  loadingLabel,
}: Props) {
  const avisoId = useId();
  return (
    <div
      className="sticky bottom-0 z-10 -mx-6 mt-8 border-t border-gray-100 px-6 pt-4"
      style={{
        background: "rgba(248, 249, 250, 0.95)",
        backdropFilter: "blur(8px)",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      {aviso && (
        <p id={avisoId} className="mb-2 text-center text-xs" style={{ color: "#888780" }}>
          {aviso}
        </p>
      )}
      <button
        onClick={onClick}
        disabled={cargando}
        aria-describedby={aviso ? avisoId : undefined}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg py-3.5 text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        style={{ background: AZUL }}
      >
        {cargando ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            {loadingLabel ?? "Conectando con Didit…"}
          </>
        ) : (
          <>
            {label}
            <span aria-hidden>→</span>
          </>
        )}
      </button>
      {error && (
        <p className="mt-2 text-center text-xs" style={{ color: ROJO }}>
          {error}
        </p>
      )}
    </div>
  );
}
