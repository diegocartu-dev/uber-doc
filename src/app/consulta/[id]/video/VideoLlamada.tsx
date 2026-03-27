"use client";

import { useEffect, useRef, useState } from "react";
import DailyIframe from "@daily-co/daily-js";
import { soundVideoLista } from "@/lib/sounds";

function detectarNavegador() {
  if (typeof navigator === "undefined")
    return { esIOS: false, esAndroid: false, esChromeIOS: false, esSafariIOS: false, esMobileAndroid: false, esMobile: false };
  const ua = navigator.userAgent;
  const esIOS = /iPhone|iPad|iPod/i.test(ua);
  const esAndroid = /Android/i.test(ua);
  const esChromeIOS = esIOS && /CriOS/i.test(ua);
  const esSafariIOS = esIOS && /Safari/i.test(ua) && !/CriOS|FxiOS/i.test(ua);
  const esMobileAndroid = esAndroid;
  return { esIOS, esAndroid, esChromeIOS, esSafariIOS, esMobileAndroid, esMobile: esIOS || esAndroid };
}

export default function VideoLlamada({ consultaId }: { consultaId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [etapaCarga, setEtapaCarga] = useState("Preparando videollamada...");
  const [mobileUrl, setMobileUrl] = useState<string | null>(null);
  const [chromeIOS, setChromeIOS] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const frameRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null);
  const iniciadoRef = useRef(false);
  const unmountedRef = useRef(false);
  const joinedRef = useRef(false);
  const nav = detectarNavegador();
  const mobile = nav.esMobile;

  useEffect(() => {
    if (iniciadoRef.current) return;
    iniciadoRef.current = true;
    unmountedRef.current = false;

    const timeoutId = setTimeout(() => {
      if (!joinedRef.current && !unmountedRef.current && !mobile) {
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

        // Mobile: manejar por tipo de navegador
        if (mobile) {
          clearTimeout(timeoutId);
          if (nav.esChromeIOS) {
            // Chrome en iPhone no soporta Daily — pedir Safari
            setChromeIOS(true);
            setCargando(false);
            return;
          }
          // Safari iOS y Android: navegar directo
          setMobileUrl(data.url);
          setCargando(false);
          return;
        }

        // Desktop: iframe
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

        callFrame.on("loading", () => console.log("[Daily] loading"));
        callFrame.on("loaded", () => console.log("[Daily] loaded"));
        callFrame.on("joining-meeting", () => console.log("[Daily] joining-meeting"));
        callFrame.on("camera-error", (e) => console.error("[Daily] camera-error", e));

        function marcarJoined() {
          if (joinedRef.current) return;
          joinedRef.current = true;
          clearTimeout(timeoutId);
          setCargando(false);
          soundVideoLista();
        }

        callFrame.on("joined-meeting", (e) => {
          console.log("[Daily] joined-meeting", e);
          marcarJoined();
        });

        callFrame.on("participant-updated", (e) => {
          if (e?.participant?.local) marcarJoined();
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
          console.error("[Daily] error", ev);
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
  }, [consultaId, mobile]);

  // Chrome en iPhone: no compatible
  if (chromeIOS) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10">
            <span className="text-4xl">⚠️</span>
          </div>
          <h2 className="mt-5 text-lg font-medium text-white">
            Chrome en iPhone no es compatible
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Daily.co no funciona en Chrome para iPhone. Copiá el link y abrilo en Safari.
          </p>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            }}
            className="mt-6 block w-full rounded-xl bg-amber-500 px-6 py-3.5 text-sm font-medium text-white transition hover:bg-amber-600"
          >
            {copiado ? "Link copiado" : "Copiar link para Safari"}
          </button>
          <button
            onClick={() => { window.location.href = "/dashboard"; }}
            className="mt-3 block w-full rounded-xl bg-gray-800 px-6 py-3 text-sm text-gray-400 transition hover:bg-gray-700"
          >
            Volver al dashboard
          </button>
        </div>
      </div>
    );
  }

  // Mobile (Safari iOS / Android): botón para navegar directo
  if (mobileUrl) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#1D9E75]/10">
            <span className="text-4xl">📹</span>
          </div>
          <h2 className="mt-5 text-lg font-medium text-white">
            Videollamada lista
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Se va a abrir la sala de Daily.co optimizada para tu dispositivo
          </p>
          <button
            onClick={() => { window.location.href = mobileUrl!; }}
            className="mt-6 block w-full rounded-xl bg-[#1D9E75] px-6 py-3.5 text-sm font-medium text-white transition hover:bg-[#178a64]"
          >
            Unirse a la videollamada
          </button>
          <button
            onClick={() => { window.location.href = "/dashboard"; }}
            className="mt-3 block w-full rounded-xl bg-gray-800 px-6 py-3 text-sm text-gray-400 transition hover:bg-gray-700"
          >
            Volver al dashboard
          </button>
        </div>
      </div>
    );
  }

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
