"use client";

import { useEffect, useRef, useState } from "react";
import DailyIframe from "@daily-co/daily-js";
import { createClient } from "@/lib/supabase/client";
import { soundVideoLista } from "@/lib/sounds";

function detectarNavegador() {
  if (typeof navigator === "undefined")
    return { esChromeIOS: false, esMobile: false };
  const ua = navigator.userAgent;
  const esIOS = /iPhone|iPad|iPod/i.test(ua);
  const esAndroid = /Android/i.test(ua);
  return {
    esChromeIOS: esIOS && /CriOS/i.test(ua),
    esMobile: esIOS || esAndroid,
  };
}

function calcularEdad(fechaNac: string | null): string {
  if (!fechaNac) return "";
  const hoy = new Date();
  const nac = new Date(fechaNac);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} años`;
}

type ConsultaData = {
  especialidad: string;
  motivo_consulta: string | null;
  sintomas: string[] | null;
  paciente_nombre: string;
  paciente_nacimiento: string | null;
  medico_nombre: string;
};

type Props = {
  consultaId: string;
  esMedico: boolean;
  consulta: ConsultaData;
};

export default function VideoLlamada({ consultaId, esMedico, consulta }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [etapaCarga, setEtapaCarga] = useState("Preparando videollamada...");
  const [mobileUrl, setMobileUrl] = useState<string | null>(null);
  const [chromeIOS, setChromeIOS] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [notas, setNotas] = useState("");
  const [indicaciones, setIndicaciones] = useState("");
  const frameRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null);
  const iniciadoRef = useRef(false);
  const unmountedRef = useRef(false);
  const joinedRef = useRef(false);
  const nav = detectarNavegador();

  const edad = calcularEdad(consulta.paciente_nacimiento);

  useEffect(() => {
    if (iniciadoRef.current) return;
    iniciadoRef.current = true;
    unmountedRef.current = false;

    const timeoutId = setTimeout(() => {
      if (!joinedRef.current && !unmountedRef.current && !nav.esMobile) {
        setCargando(false);
        setError("No se pudo conectar. La conexión tardó demasiado.");
      }
    }, 60000);

    async function iniciar() {
      try {
        setEtapaCarga("Creando sala...");

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

        if (nav.esMobile) {
          clearTimeout(timeoutId);
          if (nav.esChromeIOS) {
            setChromeIOS(true);
          } else {
            setMobileUrl(data.url);
          }
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
          },
          showLeaveButton: false,
          showFullscreenButton: false,
          showParticipantsBar: false,
          lang: "es",
          theme: {
            colors: {
              accent: "#1D9E75",
              accentText: "#ffffff",
            },
          },
        });

        frameRef.current = callFrame;

        function marcarJoined() {
          if (joinedRef.current) return;
          joinedRef.current = true;
          clearTimeout(timeoutId);
          setCargando(false);
          soundVideoLista();
        }

        callFrame.on("joined-meeting", () => marcarJoined());
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
            setError("La videollamada se desconectó. Intentá de nuevo.");
            setCargando(false);
          }
        });

        callFrame.on("error", (ev) => {
          clearTimeout(timeoutId);
          setError(`Error: ${ev?.error?.msg || ev?.errorMsg || "desconocido"}`);
          setCargando(false);
        });

        setEtapaCarga("Conectando... Aceptá los permisos de cámara y micrófono");
        await callFrame.join({ url: data.url });

        if (!joinedRef.current && !unmountedRef.current) setCargando(false);
      } catch (err) {
        console.error("[VideoLlamada]", err);
        clearTimeout(timeoutId);
        if (!unmountedRef.current) {
          setError("Error al conectar. Podés reintentar.");
          setCargando(false);
        }
      }
    }

    iniciar();
    return () => { unmountedRef.current = true; clearTimeout(timeoutId); };
  }, [consultaId, nav.esMobile, nav.esChromeIOS]);

  function toggleMic() {
    if (!frameRef.current) return;
    const next = !micOn;
    frameRef.current.setLocalAudio(next);
    setMicOn(next);
  }

  function toggleCam() {
    if (!frameRef.current) return;
    const next = !camOn;
    frameRef.current.setLocalVideo(next);
    setCamOn(next);
  }

  async function terminarConsulta() {
    if (frameRef.current) {
      frameRef.current.leave();
      frameRef.current.destroy();
      frameRef.current = null;
    }
    const supabase = createClient();
    await supabase.from("consultas").update({ estado: "completada" }).eq("id", consultaId);
    window.location.href = "/dashboard";
  }

  // --- Chrome iOS ---
  if (chromeIOS) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <span className="text-4xl">⚠️</span>
          <h2 className="mt-4 text-lg font-medium text-white">Chrome en iPhone no es compatible</h2>
          <p className="mt-2 text-sm text-gray-400">
            Copiá el link y abrilo en Safari.
          </p>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            }}
            className="mt-5 w-full rounded-lg bg-amber-500 px-5 py-3 text-sm font-medium text-white"
          >
            {copiado ? "Link copiado" : "Copiar link para Safari"}
          </button>
          <button onClick={() => { window.location.href = "/dashboard"; }} className="mt-2 w-full rounded-lg bg-gray-800 px-5 py-3 text-sm text-gray-400">
            Volver
          </button>
        </div>
      </div>
    );
  }

  // --- Mobile ---
  if (mobileUrl) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <span className="text-4xl">📹</span>
          <h2 className="mt-4 text-lg font-medium text-white">Videollamada lista</h2>
          <p className="mt-2 text-sm text-gray-400">{consulta.especialidad} — {esMedico ? consulta.paciente_nombre : `Dr. ${consulta.medico_nombre}`}</p>
          <button
            onClick={() => { window.location.href = mobileUrl!; }}
            className="mt-5 w-full rounded-lg bg-[#1D9E75] px-5 py-3.5 text-sm font-medium text-white"
          >
            Unirse a la videollamada
          </button>
          <button onClick={() => { window.location.href = "/dashboard"; }} className="mt-2 w-full rounded-lg bg-gray-800 px-5 py-3 text-sm text-gray-400">
            Volver
          </button>
        </div>
      </div>
    );
  }

  // --- Desktop ---
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Video + controles */}
      <div className="relative flex flex-1 flex-col">
        {/* Loading */}
        {cargando && !error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <svg className="mx-auto h-10 w-10 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <p className="mt-4 text-sm text-gray-400">{etapaCarga}</p>
              <p className="mt-1 text-xs text-gray-500">Aceptá los permisos de cámara y micrófono</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900">
            <div className="max-w-sm text-center">
              <p className="text-sm text-red-400">{error}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => window.location.reload()} className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">Reintentar</button>
                <button onClick={() => { window.location.href = "/dashboard"; }} className="flex-1 rounded-lg bg-gray-700 px-4 py-2 text-sm text-white">Volver</button>
              </div>
            </div>
          </div>
        )}

        {/* Video iframe */}
        <div id="video-container" className="flex-1" />

        {/* Controles propios */}
        {!cargando && !error && (
          <div className="flex items-center justify-center gap-3 bg-gray-900 px-4 py-3">
            <button
              onClick={toggleMic}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                micOn ? "bg-gray-800 text-white hover:bg-gray-700" : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              {micOn ? "🎙️ Micrófono" : "🔇 Silenciado"}
            </button>
            <button
              onClick={toggleCam}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                camOn ? "bg-gray-800 text-white hover:bg-gray-700" : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              {camOn ? "📷 Cámara" : "📷 Cámara apagada"}
            </button>
            <button
              onClick={terminarConsulta}
              className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700"
            >
              Terminar consulta
            </button>
          </div>
        )}
      </div>

      {/* Panel derecho — solo médico en desktop */}
      {esMedico && (
        <div className="hidden w-80 shrink-0 overflow-y-auto bg-white lg:block" style={{ borderLeft: "0.5px solid #e5e7eb" }}>
          <div className="p-5">
            {/* Paciente */}
            <p className="text-xs font-medium tracking-wide text-gray-400">PACIENTE</p>
            <p className="mt-2 text-lg font-medium text-gray-900">{consulta.paciente_nombre}</p>
            <p className="mt-0.5 text-sm text-gray-500">
              {[edad, consulta.especialidad].filter(Boolean).join(" · ")}
            </p>

            {/* Motivo */}
            {consulta.motivo_consulta && (
              <div className="mt-5">
                <p className="text-xs font-medium tracking-wide text-gray-400">MOTIVO</p>
                <p className="mt-1 text-sm text-gray-700">{consulta.motivo_consulta}</p>
              </div>
            )}

            {/* Síntomas */}
            {consulta.sintomas && consulta.sintomas.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-medium tracking-wide text-gray-400">SÍNTOMAS</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {consulta.sintomas.map((s) => (
                    <span key={s} className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-600" style={{ border: "0.5px solid #e5e7eb" }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Notas */}
            <div className="mt-5">
              <p className="text-xs font-medium tracking-wide text-gray-400">NOTAS DE LA CONSULTA</p>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={4}
                placeholder="Escribí notas durante la consulta..."
                className="mt-2 w-full resize-none rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1D9E75]"
                style={{ border: "0.5px solid #e5e7eb" }}
              />
            </div>

            {/* Indicaciones */}
            <div className="mt-5">
              <p className="text-xs font-medium tracking-wide text-gray-400">INDICACIONES MÉDICAS</p>
              <textarea
                value={indicaciones}
                onChange={(e) => setIndicaciones(e.target.value)}
                rows={4}
                placeholder="Indicaciones para el paciente..."
                className="mt-2 w-full resize-none rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1D9E75]"
                style={{ border: "0.5px solid #e5e7eb" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
