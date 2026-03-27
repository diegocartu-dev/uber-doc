"use client";

import { useEffect, useRef, useState } from "react";
import DailyIframe from "@daily-co/daily-js";

export default function VideoLlamada({ consultaId }: { consultaId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enLlamada, setEnLlamada] = useState(false);
  const frameRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null);
  const iniciadoRef = useRef(false);
  const unmountedRef = useRef(false);

  useEffect(() => {
    if (iniciadoRef.current) return;
    iniciadoRef.current = true;
    unmountedRef.current = false;

    async function iniciar() {
      try {
        console.log("[VideoLlamada] Iniciando, consultaId:", consultaId);

        const res = await fetch("/api/videollamada", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consultaId }),
        });
        const data = await res.json();

        console.log("[VideoLlamada] API response:", data);

        if (unmountedRef.current) {
          console.log("[VideoLlamada] Componente desmontado antes de crear frame");
          return;
        }

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

        console.log("[VideoLlamada] Creando frame con URL:", data.url);

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

        // Cuando el usuario se une exitosamente
        callFrame.on("joined-meeting", () => {
          console.log("[VideoLlamada] joined-meeting");
          setEnLlamada(true);
          setCargando(false);
        });

        // Solo redirigir si el usuario estuvo en la llamada
        callFrame.on("left-meeting", () => {
          console.log("[VideoLlamada] left-meeting, enLlamada:", true);
          callFrame.destroy();
          frameRef.current = null;
          window.location.href = "/dashboard";
        });

        // Errores de Daily
        callFrame.on("error", (ev) => {
          console.error("[VideoLlamada] Daily error:", ev);
          setError(`Error de videollamada: ${ev?.error?.msg || ev?.errorMsg || "Error desconocido"}`);
          setCargando(false);
        });

        await callFrame.join({ url: data.url });
        console.log("[VideoLlamada] join() completado");
      } catch (err) {
        console.error("[VideoLlamada] Error en iniciar():", err);
        if (!unmountedRef.current) {
          setError("Error al conectar con la videollamada. Podés reintentar.");
          setCargando(false);
        }
      }
    }

    iniciar();

    return () => {
      console.log("[VideoLlamada] Cleanup ejecutado");
      unmountedRef.current = true;
      // NO destruir el frame en cleanup — dejar que left-meeting lo maneje
      // Esto evita que un re-render mate la llamada activa
    };
  }, [consultaId]);

  return (
    <div className="flex flex-1 flex-col">
      {error && (
        <div className="mx-auto mt-8 max-w-lg rounded-lg bg-red-900/50 p-4 text-center text-sm text-red-300">
          <p>{error}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => window.location.reload()}
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
