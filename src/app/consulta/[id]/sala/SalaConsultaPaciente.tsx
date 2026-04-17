"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  GridLayout,
  ParticipantTile,
  useTracks,
  useLocalParticipant,
} from "@livekit/components-react";

import { Track } from "livekit-client";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Documento = {
  id: string;
  tipo: string;
  diagnostico: string | null;
  contenido: string;
  created_at: string;
};

type Props = {
  consultaId: string;
  roomName: string | null;
  medicoNombre: string;
  especialidad: string;
};

function VideoArea() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  return (
    <GridLayout tracks={tracks} style={{ height: "100%" }}>
      <ParticipantTile />
    </GridLayout>
  );
}

// Iconos SVG reutilizables
function MicIcon({ on }: { on: boolean }) {
  return on ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
      <path d="M5 10v2a7 7 0 0 0 12 5.66"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/>
    </svg>
  );
}

function CamIcon({ on }: { on: boolean }) {
  return on ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l6-4v11l-6-4V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1"/>
      <line x1="2" x2="22" y1="2" y2="22"/>
    </svg>
  );
}

// Hook para controles mic/cam — debe usarse dentro de LiveKitRoom
function useMicCam() {
  const { localParticipant } = useLocalParticipant();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const toggleMic = useCallback(async () => {
    const next = !micOn;
    await localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }, [micOn, localParticipant]);

  const toggleCam = useCallback(async () => {
    const next = !camOn;
    await localParticipant.setCameraEnabled(next);
    setCamOn(next);
  }, [camOn, localParticipant]);

  return { micOn, camOn, toggleMic, toggleCam };
}

// Render prop wrapper para mic/cam
function MicCamProvider({ children }: { children: (controls: { micOn: boolean; camOn: boolean; toggleMic: () => void; toggleCam: () => void }) => React.ReactNode }) {
  const controls = useMicCam();
  return <>{children(controls)}</>;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function formatTimer(seg: number): string {
  if (seg >= 3600) {
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = seg % 60;
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function tipoLabel(tipo: string): string {
  switch (tipo) {
    case "receta":
      return "Receta";
    case "indicaciones":
      return "Indicaciones";
    case "certificado":
      return "Certificado";
    default:
      return tipo.charAt(0).toUpperCase() + tipo.slice(1);
  }
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function SalaConsultaPaciente({
  consultaId,
  roomName,
  medicoNombre,
  especialidad,
}: Props) {
  const router = useRouter();
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "";

  const [estado, setEstado] = useState<string>("en_curso");
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [videoVisible, setVideoVisible] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [timerSeg, setTimerSeg] = useState(0);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [docExpandido, setDocExpandido] = useState<string | null>(null);
  const inicioRef = useRef(Date.now());
  const yaRedirigioRef = useRef(false);

  // --- Obtener token LiveKit ---
  useEffect(() => {
    if (!roomName) return;

    async function obtenerToken() {
      try {
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consultaId }),
        });
        if (!res.ok) {
          const data = await res.json();
          setTokenError(data.error || "Error al conectar video");
          return;
        }
        const data = await res.json();
        setLivekitToken(data.token);
      } catch {
        setTokenError("Error de conexion al obtener video");
      }
    }

    obtenerToken();
  }, [consultaId, roomName]);

  // --- LiveKit: desconexion detectada (medico elimino la sala) ---
  function handleDisconnected() {
    setVideoVisible(false);
    if (!yaRedirigioRef.current) {
      yaRedirigioRef.current = true;
      router.push("/mis-consultas");
    }
  }

  // --- Timer ---
  useEffect(() => {
    const i = setInterval(() => {
      setTimerSeg(Math.floor((Date.now() - inicioRef.current) / 1000));
    }, 1000);
    return () => clearInterval(i);
  }, []);

  // --- Fetch documentos cuando la consulta se completa ---
  const fetchDocumentos = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("documentos")
        .select("id, tipo, diagnostico, contenido, created_at")
        .eq("consulta_id", consultaId)
        .order("created_at", { ascending: true });
      if (data) setDocumentos(data);
    } catch {
      // silently fail
    }
  }, [consultaId]);

  // --- Realtime estado: filtro por PK (id) → válido en Supabase Realtime ---
  useEffect(() => {
    const supabase = createClient();

    // Sync inicial por si el estado cambió antes de montar el componente
    supabase
      .from("consultas")
      .select("estado")
      .eq("id", consultaId)
      .single()
      .then(({ data }) => {
        if (!data?.estado) return;
        setEstado(data.estado);
        if (data.estado === "completada") fetchDocumentos();
      });

    const channel = supabase
      .channel(`sala-paciente-${consultaId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "consultas", filter: `id=eq.${consultaId}` },
        (payload) => {
          const row = payload.new as { estado: string };
          if (!row.estado) return;
          setEstado(row.estado);
          if (row.estado === "completada") {
            setVideoVisible(false);
            fetchDocumentos();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [consultaId, fetchDocumentos]);

  // --- Polling de respaldo cada 5s (complementa Realtime) ---
  useEffect(() => {
    const interval = setInterval(async () => {
      if (yaRedirigioRef.current) return;
      try {
        const res = await fetch(`/api/consulta-estado?consultaId=${consultaId}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.estado === "completada") {
          yaRedirigioRef.current = true;
          clearInterval(interval);
          setVideoVisible(false);
          router.push("/mis-consultas");
        }
      } catch {
        // Polling: falla silenciosamente, el siguiente tick reintenta
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [consultaId, router]);

  // --- Pantalla de cierre (completada) ---
  if (estado === "completada") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-gray-50">
        {/* Header */}
        <nav className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🩺</span>
              <span className="text-xl font-bold text-gray-900">Docto</span>
            </div>
          </div>
        </nav>

        <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
          <div className="mx-auto w-full max-w-lg">
            {/* Icono y mensaje */}
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#1D9E75]/10">
                <svg
                  className="h-10 w-10 text-[#1D9E75]"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h1 className="mt-6 text-2xl font-bold text-gray-900">
                Consulta finalizada
              </h1>
              <p className="mt-2 text-gray-600">
                Tu consulta con Dr. {medicoNombre} ha finalizado
              </p>
            </div>

            {/* Documentos */}
            {documentos.length > 0 && (
              <div className="mt-8">
                <p className="text-xs font-medium tracking-wide text-gray-400">
                  DOCUMENTOS DE TU CONSULTA
                </p>
                <div className="mt-3 space-y-3">
                  {documentos.map((doc) => (
                    <div
                      key={doc.id}
                      className="rounded-xl border border-gray-200 bg-white shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setDocExpandido(
                            docExpandido === doc.id ? null : doc.id
                          )
                        }
                        className="flex w-full items-center justify-between px-5 py-4 text-left"
                        style={{ minHeight: "44px" }}
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {tipoLabel(doc.tipo)}
                          </p>
                          {doc.diagnostico && (
                            <p className="mt-0.5 text-xs text-gray-500">
                              {doc.diagnostico}
                            </p>
                          )}
                        </div>
                        <span className="text-gray-400 text-sm">
                          {docExpandido === doc.id ? "▲" : "▼"}
                        </span>
                      </button>
                      {docExpandido === doc.id && (
                        <div
                          className="border-t border-gray-100 px-5 py-4"
                        >
                          <p className="whitespace-pre-wrap text-sm text-gray-700">
                            {doc.contenido}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {documentos.length === 0 && (
              <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
                <p className="text-sm text-gray-500">
                  No se generaron documentos en esta consulta
                </p>
              </div>
            )}

            {/* Botón volver */}
            <a
              href="/dashboard"
              className="mt-8 block w-full rounded-xl bg-[#1D9E75] px-6 py-3.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-[#178a64] active:scale-95 transition-all duration-100"
              style={{ minHeight: "44px" }}
            >
              Volver al inicio
            </a>
          </div>
        </main>
      </div>
    );
  }

  // --- Pantalla de cancelación ---
  if (estado === "cancelada") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-gray-50">
        <nav className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🩺</span>
              <span className="text-xl font-bold text-gray-900">Docto</span>
            </div>
          </div>
        </nav>

        <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
          <div className="mx-auto w-full max-w-lg text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(226,75,74,0.1)" }}>
              <svg
                className="h-10 w-10"
                style={{ color: "#E24B4A" }}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="mt-6 text-2xl font-bold text-gray-900">
              Consulta cancelada
            </h1>
            <p className="mt-2 text-gray-600">
              La consulta con Dr. {medicoNombre} fue cancelada
            </p>
            <a
              href="/dashboard"
              className="mt-8 inline-block rounded-xl border border-gray-300 px-8 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition-all duration-100"
              style={{ minHeight: "44px" }}
            >
              Volver al inicio
            </a>
          </div>
        </main>
      </div>
    );
  }

  // --- Sala de video activa ---
  return (
    <div className="flex h-[100dvh] flex-col bg-gray-900">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "0.5px solid rgba(255,255,255,0.1)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">🩺</span>
            <span className="text-sm font-bold text-white">Docto</span>
          </div>
          <div className="hidden sm:block h-4 w-px bg-white/20" />
          <p className="text-sm text-white/80 truncate">
            Consulta con Dr. {medicoNombre}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#1D9E75]" />
          <span className="text-xs tabular-nums text-white/50">
            {formatTimer(timerSeg)}
          </span>
        </div>
      </div>

      {/* Video + footer — todo dentro de LiveKitRoom para que hooks mic/cam funcionen */}
      {livekitToken && roomName && livekitUrl ? (
        <div className="flex flex-1 flex-col min-h-0" style={{ display: videoVisible ? "flex" : "none" }}>
          <LiveKitRoom
            serverUrl={livekitUrl}
            token={livekitToken}
            connect={true}
            onDisconnected={handleDisconnected}
            style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
          >
            <RoomAudioRenderer />

            {/* Video area */}
            <div className="flex-1 min-h-0">
              <VideoArea />
            </div>

            {/* Footer: mic + cam + info + salir */}
            <MicCamProvider>
              {({ micOn, camOn, toggleMic, toggleCam }) => (
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderTop: "0.5px solid rgba(255,255,255,0.1)" }}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleMic}
                      className={`rounded-full p-3 transition ${micOn ? "bg-white/10 text-white hover:bg-white/20" : "bg-red-600 text-white"}`}
                      style={{ minHeight: "44px", minWidth: "44px" }}
                    >
                      <MicIcon on={micOn} />
                    </button>
                    <button
                      type="button"
                      onClick={toggleCam}
                      className={`rounded-full p-3 transition ${camOn ? "bg-white/10 text-white hover:bg-white/20" : "bg-red-600 text-white"}`}
                      style={{ minHeight: "44px", minWidth: "44px" }}
                    >
                      <CamIcon on={camOn} />
                    </button>
                    <p className="text-xs text-white/40 hidden sm:block">
                      Tu médico te está atendiendo · {especialidad}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard")}
                    className="rounded-lg px-4 py-2 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition"
                    style={{ minHeight: "44px" }}
                  >
                    Salir
                  </button>
                </div>
              )}
            </MicCamProvider>
          </LiveKitRoom>
        </div>
      ) : (
        <>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              {tokenError ? (
                <p className="text-sm text-red-400">{tokenError}</p>
              ) : (
                <>
                  <svg
                    className="mx-auto h-6 w-6 animate-spin text-white/40"
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
                  <p className="mt-3 text-sm text-white/50">
                    Conectando video...
                  </p>
                </>
              )}
            </div>
          </div>
          {/* Footer sin controles (aún no hay LiveKit) */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: "0.5px solid rgba(255,255,255,0.1)" }}
          >
            <p className="text-xs text-white/40">
              Conectando...
            </p>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-lg px-4 py-2 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition"
              style={{ minHeight: "44px" }}
            >
              Salir
            </button>
          </div>
        </>
      )}
    </div>
  );
}
