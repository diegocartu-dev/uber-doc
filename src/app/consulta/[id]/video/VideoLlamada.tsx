"use client";

import { useEffect, useRef, useState } from "react";
import DailyIframe from "@daily-co/daily-js";
import { soundVideoLista } from "@/lib/sounds";

function detectarNavegador(): { esMobile: boolean; esSafari: boolean } {
  if (typeof navigator === "undefined") return { esMobile: false, esSafari: false };
  const ua = navigator.userAgent;
  return {
    esMobile: /iPhone|iPad|iPod|Android/i.test(ua),
    esSafari: /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS/i.test(ua),
  };
}

export default function VideoLlamada({ consultaId }: { consultaId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [etapaCarga, setEtapaCarga] = useState("Preparando videollamada...");
  const [advertencia, setAdvertencia] = useState<string | null>(null);
  const frameRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null);
  const iniciadoRef = useRef(false);
  const unmountedRef = useRef(false);
  const joinedRef = useRef(false);

  useEffect(() => {
    if (iniciadoRef.current) return;
    iniciadoRef.current = true;
    unmountedRef.current = false;

    const { esMobile, esSafari } = detectarNavegador();
    if (esMobile && esSafari) {
      setAdvertencia(
        "Safari mobile puede tener problemas con videollamadas. Si no funciona, abrí este link en Chrome."
      );
    }

    const timeoutId = setTimeout(() => {
      if (!joinedRef.current && !unmountedRef.current) {
        setCargando(false);
        setError("No se pudo conectar a la videollamada. La conexión tardó demasiado.");
      }
    }, 60000);

    async function iniciar() {
      try {
        setEtapaCarga("Creando sala de videollamada...");

        const res = await fetch("/api/videollamada", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consultaId }),
        });
        const data = await res.json();

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

        setEtapaCarga("Esperando permisos de cámara y micrófono...");

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

        // Debug logs
        callFrame.on("loading", () => console.log("[Daily] loading"));
        callFrame.on("loaded", () => console.log("[Daily] loaded"));
        callFrame.on("joining-meeting", () => console.log("[Daily] joining-meeting"));
        callFrame.on("participant-updated", (e) => console.log("[Daily] participant-updated", e));
        callFrame.on("camera-error", (e) => console.error("[Daily] camera-error", e));
        callFrame.on("network-quality-change", (e) => console.log("[Daily] network-quality", e));

        callFrame.on("joined-meeting", (e) => {
          console.log("[Daily] joined-meeting", e);
          joinedRef.current = true;
          clearTimeout(timeoutId);
          setCargando(false);
          soundVideoLista();
        });

        callFrame.on("left-meeting", () => {
          if (joinedRef.current) {
            callFrame.destroy();
            frameRef.current = null;
            window.location.href = "/dashboard";
          } else {
            clearTimeout(timeoutId);
            setError("La videollamada se desconectó antes de iniciar. Intentá de nuevo.");
            setCargando(false);
          }
        });

        callFrame.on("error", (ev) => {
          console.error("[VideoLlamada] Daily error:", ev);
          clearTimeout(timeoutId);
          const msg = ev?.error?.msg || ev?.errorMsg || "Error desconocido";
          setError(`Error de videollamada: ${msg}`);
          setCargando(false);
        });

        setEtapaCarga("Conectando... Aceptá los permisos de cámara y micrófono en tu navegador");

        await callFrame.join({ url: data.url });

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
                {etapaCarga}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Si tu navegador pide permisos, aceptalos para continuar
              </p>
            </div>
          </div>
        )}

        <div id="video-container" style={{ width: "100%", height: "100vh", minHeight: "500px" }} />
      </div>
    </div>
  );
}
