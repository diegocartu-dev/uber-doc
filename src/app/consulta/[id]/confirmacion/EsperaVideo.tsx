"use client";

import { useEffect, useState } from "react";

export default function EsperaVideo({
  consultaId,
  salaVideoUrlInicial,
  estadoInicial,
}: {
  consultaId: string;
  salaVideoUrlInicial: string | null;
  estadoInicial?: string;
}) {
  const [salaUrl, setSalaUrl] = useState(salaVideoUrlInicial);
  const [estado, setEstado] = useState<string | null>(estadoInicial ?? null);

  // Polling cada 3s via API route
  useEffect(() => {
    if (salaUrl) return;

    async function poll() {
      try {
        const res = await fetch(`/api/consulta-estado?consultaId=${consultaId}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.estado) setEstado(data.estado);
        if (data.sala_video_url) {
          setSalaUrl(data.sala_video_url);
        }
        // Si la consulta fue cancelada, mostrar eso
        if (data.estado === "cancelada") {
          setEstado("cancelada");
        }
      } catch {
        // silently ignore
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [consultaId, salaUrl]);

  if (estado === "cancelada") {
    return (
      <div className="rounded-xl border border-gray-200 bg-red-50 px-6 py-4 text-center">
        <p className="text-sm font-medium" style={{ color: "#E24B4A" }}>
          La consulta fue cancelada por el medico.
        </p>
      </div>
    );
  }

  if (salaUrl) {
    return (
      <a
        href={`/consulta/${consultaId}/video`}
        className="block w-full rounded-xl bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 active:opacity-80 transition-all duration-100"
      >
        Unirse a la videollamada
      </a>
    );
  }

  if (estado === "pagada") {
    return (
      <div className="rounded-xl border px-6 py-4 text-center" style={{ borderColor: "#1D9E75", background: "rgba(29,158,117,0.06)" }}>
        <p className="text-sm font-medium" style={{ color: "#1D9E75" }}>
          ✓ Pago confirmado
        </p>
        <p className="mt-1 text-xs text-gray-500">
          El médico iniciará la videollamada en breve
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-4 text-center">
      <div className="flex items-center justify-center gap-2">
        <svg
          className="h-4 w-4 animate-spin text-gray-400"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <p className="text-sm text-gray-500">
          {estado === "aceptada"
            ? "Esperando confirmacion de pago..."
            : "Conectando con el medico..."}
        </p>
      </div>
    </div>
  );
}
