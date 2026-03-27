"use client";

import { useEffect, useRef, useState } from "react";
import DailyIframe from "@daily-co/daily-js";

export default function VideoLlamada({ consultaId }: { consultaId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const frameRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null);
  const iniciadoRef = useRef(false);

  useEffect(() => {
    // Evitar doble ejecución en StrictMode
    if (iniciadoRef.current) return;
    iniciadoRef.current = true;

    async function iniciar() {
      try {
        const res = await fetch("/api/videollamada", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consultaId }),
        });
        const data = await res.json();

        if (!data.url) {
          setError(data.error || "No se pudo crear la videollamada.");
          setCargando(false);
          return;
        }

        const container = document.getElementById("video-container");
        if (!container) {
          setError("No se encontró el contenedor de video.");
          setCargando(false);
          return;
        }

        const callFrame = DailyIframe.createFrame(container, {
          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "0",
            borderRadius: "12px",
          },
          showLeaveButton: true,
          showFullscreenButton: true,
        });

        frameRef.current = callFrame;

        // Solo redirigir cuando el usuario VOLUNTARIAMENTE sale
        callFrame.on("left-meeting", () => {
          callFrame.destroy();
          frameRef.current = null;
          window.location.href = "/dashboard";
        });

        await callFrame.join({ url: data.url });
        setCargando(false);
      } catch (err) {
        console.error("[VideoLlamada] Error:", err);
        setError("Error al conectar con la videollamada. Podés reintentar.");
        setCargando(false);
      }
    }

    iniciar();

    return () => {
      if (frameRef.current) {
        try { frameRef.current.destroy(); } catch {}
        frameRef.current = null;
      }
    };
  }, [consultaId]);

  return (
    <div className="flex flex-1 flex-col">
      {error && (
        <div className="mx-auto mt-8 max-w-lg rounded-lg bg-red-900/50 p-4 text-center text-sm text-red-300">
          <p>{error}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setError(null);
                setCargando(true);
                iniciadoRef.current = false;
                window.location.reload();
              }}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              Reintentar
            </button>
            <button
              onClick={() => { window.location.href = "/dashboard"; }}
              className="flex-1 rounded-lg bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600"
            >
              Volver al dashboard
            </button>
          </div>
        </div>
      )}

      <div className="relative flex-1">
        {cargando && !error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <svg
                className="mx-auto h-10 w-10 animate-spin text-blue-400"
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
              <p className="mt-4 text-sm text-gray-400">
                Conectando videollamada...
              </p>
            </div>
          </div>
        )}

        <div id="video-container" className="h-full w-full p-4" />
      </div>
    </div>
  );
}
