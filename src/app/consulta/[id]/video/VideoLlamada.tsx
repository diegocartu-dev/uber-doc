"use client";

import { useEffect, useRef, useState } from "react";
import DailyIframe from "@daily-co/daily-js";

function detectarNavegador(): { esMobile: boolean; esSafari: boolean; nombre: string } {
  if (typeof navigator === "undefined") return { esMobile: false, esSafari: false, nombre: "" };
  const ua = navigator.userAgent;
  const esMobile = /iPhone|iPad|iPod|Android/i.test(ua);
  const esSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS/i.test(ua);
  const nombre = esSafari ? "Safari" : /CriOS/i.test(ua) ? "Chrome iOS" : /Chrome/i.test(ua) ? "Chrome" : "Navegador";
  return { esMobile, esSafari, nombre };
}

export default function VideoLlamada({ consultaId }: { consultaId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [advertencia, setAdvertencia] = useState<string | null>(null);
  const frameRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null);
  const iniciadoRef = useRef(false);
  const unmountedRef = useRef(false);
  const joinedRef = useRef(false);

  useEffect(() => {
    if (iniciadoRef.current) return;
    iniciadoRef.current = true;
    unmountedRef.current = false;

    // Detectar navegador
    const { esMobile, esSafari } = detectarNavegador();
    if (esMobile && esSafari) {
      setAdvertencia(
        "Safari mobile puede tener problemas con videollamadas. Si no funciona, abrí este link en Chrome."
      );
    }

    // Timeout de conexión
    const timeoutId = setTimeout(() => {
      if (!joinedRef.current && !unmountedRef.current) {
        console.warn("[VideoLlamada] Timeout: 15s sin joined-meeting");
        setCargando(false);
        setError("No se pudo conectar a la videollamada. La conexión tardó demasiado.");
      }
    }, 15000);

    async function iniciar() {
      try {
        console.log("[VideoLlamada] Iniciando, consultaId:", consultaId);

        const res = await fetch("/api/videollamada", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consultaId }),
        });
        const data = await res.json();

        console.log("[VideoLlamada] API response:", { url: data.url ? "OK" : "null", error: data.error });

        if (unmountedRef.current) return;

        if (!data.url) {
          clearTimeout(timeoutId);
          setError(data.error || "No se pudo crear la videollamada.");
          setCargando(false);
          return;
        }

        const container = document.getElementById("video-container");
        if (!container) {
          clearTimeout(timeoutId);
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

        callFrame.on("joined-meeting", () => {
          console.log("[VideoLlamada] joined-meeting");
          joinedRef.current = true;
          clearTimeout(timeoutId);
          setCargando(false);
        });

        // Solo redirigir si el usuario realmente estuvo en la llamada
        callFrame.on("left-meeting", () => {
          console.log("[VideoLlamada] left-meeting, joined:", joinedRef.current);
          if (joinedRef.current) {
            callFrame.destroy();
            frameRef.current = null;
            window.location.href = "/dashboard";
          } else {
            // Daily no pudo conectar — no redirigir, mostrar error
            clearTimeout(timeoutId);
            setError("La videollamada se desconectó antes de iniciar. Intentá de nuevo.");
            setCargando(false);
          }
        });

        callFrame.on("error", (ev) => {
          console.error("[VideoLlamada] Daily error event:", ev);
          clearTimeout(timeoutId);
          const msg = ev?.error?.msg || ev?.errorMsg || "Error desconocido";
          setError(`Error de videollamada: ${msg}`);
          setCargando(false);
        });

        await callFrame.join({ url: data.url });
        console.log("[VideoLlamada] join() promise resolved");

        // Fallback: si join() resuelve pero joined-meeting no disparó aún
        if (!joinedRef.current && !unmountedRef.current) {
          setCargando(false);
        }
      } catch (err) {
        console.error("[VideoLlamada] Error:", err);
        clearTimeout(timeoutId);
        if (!unmountedRef.current) {
          setError("Error al conectar con la videollamada. Podés reintentar.");
          setCargando(false);
        }
      }
    }

    iniciar();

    return () => {
      unmountedRef.current = true;
      clearTimeout(timeoutId);
    };
  }, [consultaId]);

  return (
    <div className="flex flex-1 flex-col">
      {/* Advertencia de navegador */}
      {advertencia && !error && (
        <div className="mx-4 mt-3 rounded-lg bg-amber-900/40 px-4 py-2 text-center text-xs text-amber-300">
          {advertencia}
        </div>
      )}

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
