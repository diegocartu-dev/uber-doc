"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useTracks,
  useLocalParticipant,
  useDataChannel,
} from "@livekit/components-react";
import { Track, DisconnectReason } from "livekit-client";
import { createClient } from "@/lib/supabase/client";
import EstudiosPaciente from "@/components/EstudiosPaciente";
import { formatNombreMedico } from "@/lib/utils/texto";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Props = {
  consultaId: string;
  roomName: string | null;
  medicoNombre: string;
  especialidad: string;
  tipo?: "consulta" | "turno";
  horaInicio?: string | null;
};

function VideoArea() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  // Separar local vs remoto para layout PiP
  const remoteTracks = tracks.filter((t) => !t.participant.isLocal);
  const localTracks = tracks.filter((t) => t.participant.isLocal);
  const remoteTrack = remoteTracks[0] || null;
  const localTrack = localTracks[0] || null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Remoto (medico) — pantalla completa */}
      <div style={{ position: "absolute", inset: 0 }} className="bg-gray-800 flex items-center justify-center">
        {remoteTrack ? (
          remoteTrack.publication && !remoteTrack.publication.isMuted ? (
            <VideoTrack
              trackRef={remoteTrack}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="h-20 w-20 rounded-full bg-gray-600 flex items-center justify-center">
                <span className="text-2xl text-gray-300">
                  {remoteTrack.participant.name?.[0]?.toUpperCase() || "?"}
                </span>
              </div>
              <span className="text-xs text-white/50">
                {remoteTrack.participant.name || "Participante"}
              </span>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="h-20 w-20 rounded-full bg-gray-600 flex items-center justify-center">
              <span className="text-2xl text-gray-300">?</span>
            </div>
            <span className="text-xs text-white/50">Esperando medico...</span>
          </div>
        )}
      </div>

      {/* Local (paciente) — PiP esquina inferior derecha */}
      {localTrack && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            right: 12,
            width: 120,
            height: 90,
            borderRadius: 8,
            overflow: "hidden",
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
          className="bg-gray-700 flex items-center justify-center"
        >
          {localTrack.publication && !localTrack.publication.isMuted ? (
            <VideoTrack
              trackRef={localTrack}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div className="flex items-center justify-center h-full w-full">
              <span className="text-xs text-gray-300">
                {localTrack.participant.name?.[0]?.toUpperCase() || "Yo"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
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

// Banner de dictado — escucha Data Messages del médico. Debe estar DENTRO de <LiveKitRoom>
const decoder = new TextDecoder();

function DictadoBanner({ medicoNombre }: { medicoNombre: string }) {
  const [visible, setVisible] = useState(false);

  useDataChannel("dictado", (msg) => {
    try {
      const data = JSON.parse(decoder.decode(msg.payload));
      setVisible(!!data.dictando);
    } catch {
      // payload inválido — ignorar
    }
  });

  if (!visible) return null;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2"
      style={{ backgroundColor: "#D85A3020", borderBottom: "1px solid #D85A30" }}
    >
      <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: "#D85A30" }} />
      <span className="text-xs font-medium text-white">
        {formatNombreMedico(medicoNombre)} está grabando tus indicaciones
      </span>
    </div>
  );
}

// Hook para controles mic/cam — debe usarse dentro de LiveKitRoom
function useMicCam() {
  const { localParticipant } = useLocalParticipant();
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);

  // Feedback optimista: el botón cambia AL INSTANTE (antes del await). En mobile
  // la primera activación de cámara/mic espera permiso + dispositivo (lento) → sin
  // esto el usuario cree que no pasó nada y vuelve a tocar. Revierte si falla.
  const toggleMic = useCallback(async () => {
    const next = !micOn;
    setMicOn(next);
    setMicError(null);
    try {
      await localParticipant.setMicrophoneEnabled(next);
    } catch (err) {
      setMicOn(!next);
      if (next) {
        // Solo mostrar error al intentar ACTIVAR
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("Permission") || msg.includes("NotAllowed") || msg.includes("permission")) {
          setMicError("Permití el acceso al micrófono en tu navegador. Tocá el ícono de candado en la barra de direcciones.");
        } else if (msg.includes("NotFound") || msg.includes("Requested device not found")) {
          setMicError("No se encontró un micrófono en tu dispositivo.");
        } else {
          setMicError("No se pudo activar el micrófono. Intentá de nuevo.");
        }
        // Auto-limpiar el error después de 8 segundos
        setTimeout(() => setMicError(null), 8000);
      }
    }
  }, [micOn, localParticipant]);

  const toggleCam = useCallback(async () => {
    const next = !camOn;
    setCamOn(next);
    setCamError(null);
    try {
      await localParticipant.setCameraEnabled(next);
    } catch (err) {
      setCamOn(!next);
      if (next) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("Permission") || msg.includes("NotAllowed") || msg.includes("permission")) {
          setCamError("Permití el acceso a la cámara en tu navegador. Tocá el ícono de candado en la barra de direcciones.");
        } else if (msg.includes("NotFound") || msg.includes("Requested device not found")) {
          setCamError("No se encontró una cámara en tu dispositivo.");
        } else {
          setCamError("No se pudo activar la cámara. Intentá de nuevo.");
        }
        setTimeout(() => setCamError(null), 8000);
      }
    }
  }, [camOn, localParticipant]);

  return { micOn, camOn, toggleMic, toggleCam, micError, camError };
}

type MicCamControls = {
  micOn: boolean;
  camOn: boolean;
  toggleMic: () => void;
  toggleCam: () => void;
  micError: string | null;
  camError: string | null;
};

// Render prop wrapper para mic/cam
function MicCamProvider({ children }: { children: (controls: MicCamControls) => React.ReactNode }) {
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

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function SalaConsultaPaciente({
  consultaId,
  roomName,
  medicoNombre,
  especialidad,
  tipo = "consulta",
  horaInicio,
}: Props) {
  // Estado completado difiere entre consultas ("completada") y turnos ("completado")
  const estadoCompletado = tipo === "turno" ? "completado" : "completada";
  const router = useRouter();
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "";

  const [estado, setEstado] = useState<string>("en_curso");
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [videoVisible, setVideoVisible] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [timerSeg, setTimerSeg] = useState(0);
  const [showEstudios, setShowEstudios] = useState(false);
  const [showSalirDialog, setShowSalirDialog] = useState(false);
  // cerrando: el médico finalizó (ROOM_DELETED) pero la consulta aún no figura
  // como completada en DB. Mostramos pantalla de transición cálida hasta que
  // Realtime/polling traigan el estado completado (o el fallback anti-trabado).
  const [cerrando, setCerrando] = useState(false);
  // rejoin (Fase 1): la llamada se cortó por algo que NO es la finalización del
  // médico (no ROOM_DELETED) y la consulta sigue en_curso. Mostramos pantalla
  // "Se cortó la llamada / Retomar". El reloj real (2 min) vive en el servidor
  // (desconectado_at + cron). Acá solo mostramos UI y un contador derivado.
  const [mostrandoRejoin, setMostrandoRejoin] = useState(false);
  const [reconectando, setReconectando] = useState(false);
  // reconectandoRef: guard SÍNCRONO para handleDisconnected (mismo patrón que el
  // médico). El useState `reconectando` se actualiza async → entre el "Retomar" y
  // el render hay una ventana en la que el disconnect del room viejo se cuela y
  // dispara la pantalla de rejoin (parpadeo). El ref se setea inline, sin esa carrera.
  const reconectandoRef = useRef(false);
  const [errorRejoin, setErrorRejoin] = useState(false);
  const [desconectadoAt, setDesconectadoAt] = useState<string | null>(null);
  // roomKey: al cambiar fuerza el remount del <LiveKitRoom> para reconectar con
  // un token fresco al retomar.
  const [roomKey, setRoomKey] = useState(0);
  const inicioRef = useRef(horaInicio ? new Date(horaInicio).getTime() : Date.now());
  // yaCerroRef: guard de "ya cerramos" (transición a pantalla de cierre).
  // Frena el polling para no re-disparar fetch/setState una vez cerrado.
  const yaCerroRef = useRef(false);

  // --- Obtener token LiveKit ---
  useEffect(() => {
    if (!roomName) return;

    async function obtenerToken() {
      try {
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consultaId, tipo }),
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

  // --- LiveKit: desconexion detectada ---
  // ROOM_DELETED = el médico finalizó la consulta → convergemos a la pantalla
  // de cierre (NO redirigir). [#169 — NO TOCAR esta rama.]
  //
  // Cualquier otro motivo (caída de red, etc.) Y la consulta sigue en_curso →
  // FASE 1: mostramos la pantalla "Se cortó la llamada / Retomar" en vez de
  // redirigir. Si tras el corte el estado pasa a un terminal (lo trae
  // Realtime/polling, intactos), la vista converge a cierre/cancelación como hoy.
  function handleDisconnected(reason?: DisconnectReason) {
    setVideoVisible(false);
    if (reason === DisconnectReason.ROOM_DELETED) {
      setCerrando(true);
      return;
    }
    // Si estamos reconectando a propósito (remount por "Retomar"), ignorar este
    // disconnect del room viejo. Ref síncrono → sin ventana de carrera (parpadeo).
    if (reconectandoRef.current) return;
    // Si la consulta ya cerró/se canceló, no mostramos rejoin: dejamos que la
    // vista converja a la pantalla terminal correspondiente.
    if (yaCerroRef.current || estado !== "en_curso") {
      if (!yaCerroRef.current) {
        yaCerroRef.current = true;
        router.push("/mis-consultas");
      }
      return;
    }
    // Corte accidental con consulta en_curso → pantalla de rejoin.
    setMostrandoRejoin(true);
  }

  // --- Retomar llamada (paciente) ---
  // Pide un token fresco y remonta el <LiveKitRoom> para reconectar al room (que
  // sigue vivo por emptyTimeout: 7200). El webhook participant_joined limpiará
  // desconectado_at server-side.
  async function retomarLlamada() {
    setReconectando(true);
    setErrorRejoin(false);
    reconectandoRef.current = true;
    try {
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId, tipo }),
      });
      if (!res.ok) {
        // 409 = la consulta ya finalizó → converger a cierre por polling, sin
        // error inline. Cualquier otro no-ok (5xx, etc.) → feedback de error.
        if (res.status !== 409) setErrorRejoin(true);
        return;
      }
      const data = await res.json();
      setLivekitToken(data.token);
      setMostrandoRejoin(false);
      setDesconectadoAt(null);
      setVideoVisible(true);
      setRoomKey((k) => k + 1); // fuerza remount → reconecta
    } catch {
      // Falla de red (el caso MÁS probable en esta pantalla): feedback inline para
      // que el paciente reintente. Dejamos la pantalla de rejoin visible.
      setErrorRejoin(true);
    } finally {
      setReconectando(false);
      // Liberar el flag de reconexión tras el remount (mismo patrón que el médico).
      setTimeout(() => { reconectandoRef.current = false; }, 1500);
    }
  }

  // --- Timer ---
  useEffect(() => {
    const i = setInterval(() => {
      setTimerSeg(Math.floor((Date.now() - inicioRef.current) / 1000));
    }, 1000);
    return () => clearInterval(i);
  }, []);

  // --- Realtime estado: filtro por PK (id) → válido en Supabase Realtime ---
  const tabla = tipo === "turno" ? "turnos" : "consultas";

  useEffect(() => {
    const supabase = createClient();

    // Sync inicial por si el estado cambió antes de montar el componente
    supabase
      .from(tabla)
      .select("estado")
      .eq("id", consultaId)
      .single()
      .then(({ data }) => {
        if (!data?.estado) return;
        setEstado(data.estado);
      });

    const channel = supabase
      .channel(`sala-paciente-${consultaId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: tabla, filter: `id=eq.${consultaId}` },
        (payload) => {
          const row = payload.new as { estado: string };
          if (!row.estado) return;
          setEstado(row.estado);
          if (row.estado === estadoCompletado) {
            yaCerroRef.current = true;
            setVideoVisible(false);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [consultaId, tabla, estadoCompletado]);

  // --- Polling de respaldo cada 5s (complementa Realtime) ---
  const pollingUrl = tipo === "turno"
    ? `/api/turno-estado?turnoId=${consultaId}`
    : `/api/consulta-estado?consultaId=${consultaId}`;

  useEffect(() => {
    const interval = setInterval(async () => {
      if (yaCerroRef.current) return;
      try {
        const res = await fetch(pollingUrl, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        // Mientras estamos en rejoin: reflejar el reloj de servidor.
        // - desconectado_at === null + estado en_curso → el servidor detectó la
        //   reconexión (o nunca arrancó el reloj): el contador desaparece.
        // - estado terminal → el cron resolvió: convergemos a cierre.
        if ("desconectado_at" in data) setDesconectadoAt(data.desconectado_at ?? null);
        if (data.estado === estadoCompletado) {
          // Convergemos a la pantalla de cierre (igual que el Realtime),
          // NO redirigimos a /mis-consultas — el paciente ve sus documentos
          // en Mis documentos desde la pantalla de cierre.
          yaCerroRef.current = true;
          clearInterval(interval);
          setEstado(estadoCompletado);
          setMostrandoRejoin(false);
          setVideoVisible(false);
        }
      } catch {
        // Polling: falla silenciosamente, el siguiente tick reintenta
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [pollingUrl, estadoCompletado]);

  // --- Fallback anti-trabado: si tras ~20s en "cerrando" el estado sigue sin ser
  // completado (el update del médico falló silenciosamente), forzamos una pantalla
  // de cierre graciosa que deriva a /mis-consultas. NO dejamos al paciente trabado. ---
  const [fallbackCierre, setFallbackCierre] = useState(false);
  useEffect(() => {
    if (!cerrando) return;
    if (estado === estadoCompletado) return;
    const t = setTimeout(() => setFallbackCierre(true), 20000);
    return () => clearTimeout(t);
  }, [cerrando, estado, estadoCompletado]);

  // --- Pantalla de cierre (completada/completado) ---
  if (estado === estadoCompletado) {
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
                Tu consulta con {formatNombreMedico(medicoNombre)} ha finalizado
              </p>
              <p className="mt-3 text-sm text-gray-500">
                Tus recetas y documentos quedaron guardados en Mis documentos.
              </p>
            </div>

            {/* Botón ver documentos */}
            <a
              href="/documentos"
              className="mt-8 block w-full rounded-xl bg-[#378ADD] px-6 py-3.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-[#2e6fb5] active:scale-95 transition-all duration-100"
              style={{ minHeight: "44px" }}
            >
              Ver mis documentos
            </a>
          </div>
        </main>
      </div>
    );
  }

  // --- Fallback anti-trabado: el médico finalizó pero el estado no llegó a
  // completado en ~20s. Cierre gracioso que deriva a Mis documentos. ---
  if (cerrando && fallbackCierre) {
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
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#1D9E75]/10">
              <svg className="h-10 w-10 text-[#1D9E75]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="mt-6 text-2xl font-bold text-gray-900">Consulta finalizada</h1>
            <p className="mt-2 text-gray-600">
              En unos minutos vas a encontrar tus recetas y documentos en Mis documentos.
            </p>
            <a
              href="/documentos"
              className="mt-8 inline-block w-full max-w-xs rounded-xl bg-[#378ADD] px-6 py-3.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-[#2e6fb5] active:scale-95 transition-all duration-100"
              style={{ minHeight: "44px" }}
            >
              Ver mis documentos
            </a>
          </div>
        </main>
      </div>
    );
  }

  // --- Pantalla de transición: el médico finalizó (ROOM_DELETED) y esperamos
  // que el estado pase a completado para mostrar la pantalla de cierre con docs. ---
  if (cerrando) {
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
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#1D9E75]/10">
              <svg className="h-8 w-8 animate-spin text-[#1D9E75]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            </div>
            <h1 className="mt-6 text-2xl font-bold text-gray-900">Consulta finalizada</h1>
            <p className="mt-2 text-gray-600">
              Cargando tus documentos…
            </p>
          </div>
        </main>
      </div>
    );
  }

  // --- Pantalla de cancelación ---
  const esCancelado = tipo === "turno"
    ? (estado === "cancelado_medico" || estado === "cancelado_paciente")
    : estado === "cancelada";
  if (esCancelado) {
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
              La consulta con {formatNombreMedico(medicoNombre)} fue cancelada
            </p>
            <a
              href="/mis-consultas"
              className="mt-8 inline-block rounded-xl border border-gray-300 px-8 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition-all duration-100"
              style={{ minHeight: "44px" }}
            >
              Volver a mis consultas
            </a>
          </div>
        </main>
      </div>
    );
  }

  // --- Pantalla de rejoin: la llamada se cortó (no por finalización del médico) ---
  // El reloj real (2 min) lo decide el servidor. Acá mostramos un contador
  // derivado de desconectado_at solo informativo.
  if (mostrandoRejoin) {
    // Contador CUALITATIVO (no segundos exactos): el polling actualiza cada 5s y
    // un contador numérico saltaría de a 5s generando ansiedad. Mostramos SIEMPRE
    // una línea en la misma posición (sin vacío de 5s):
    //   - desconectado_at null → el servidor aún no arrancó el reloj (o reconectó).
    //   - restante <= 30s → aviso de que queda poco.
    //   - resto → mensaje tranquilizador genérico.
    const restanteSeg = desconectadoAt
      ? Math.max(0, 120 - Math.floor((Date.now() - new Date(desconectadoAt).getTime()) / 1000))
      : null;
    const textoContador =
      restanteSeg === null
        ? "Reconectando…"
        : restanteSeg <= 30
          ? "Quedan menos de 30 segundos para retomar"
          : "Estamos reconectando…";
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
          <div className="mx-auto w-full max-w-md text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(216,90,48,0.1)" }}>
              <svg className="h-10 w-10" style={{ color: "#D85A30" }} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m-12.728 0a9 9 0 010-12.728m9.9 2.829a5 5 0 010 7.07m-7.072 0a5 5 0 010-7.07" />
              </svg>
            </div>
            <h1 className="mt-6 text-2xl font-bold text-gray-900">Reconectando…</h1>
            <p className="mt-2 text-gray-600">
              Se cortó la conexión con {formatNombreMedico(medicoNombre)}. Estamos volviendo a la videollamada.
            </p>
            {/* Línea de estado SIEMPRE presente (misma posición, solo cambia el texto). */}
            <p className="mt-3 text-sm text-gray-500">
              {textoContador}
            </p>
            {errorRejoin && (
              <p className="mt-3 text-sm" style={{ color: "#E24B4A" }}>
                No pudimos reconectar. Revisá tu conexión y volvé a intentar.
              </p>
            )}
            <button
              type="button"
              onClick={retomarLlamada}
              disabled={reconectando}
              className="mt-8 inline-block w-full rounded-xl px-8 py-3 text-sm font-medium text-white active:scale-95 transition-all duration-100 disabled:opacity-50"
              style={{ backgroundColor: "#378ADD", minHeight: "48px" }}
            >
              {reconectando ? "Reconectando…" : "Retomar llamada"}
            </button>
            <a
              href="/mis-consultas"
              className="mt-3 inline-flex w-full items-center justify-center text-sm font-medium text-gray-500 hover:text-gray-700"
              style={{ minHeight: "44px", paddingTop: "10px", paddingBottom: "10px" }}
            >
              Salir
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
            Consulta con {formatNombreMedico(medicoNombre)}
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
            key={roomKey}
            serverUrl={livekitUrl}
            token={livekitToken}
            connect={true}
            audio={false}
            video={false}
            onDisconnected={handleDisconnected}
            style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
          >
            <RoomAudioRenderer />
            <DictadoBanner medicoNombre={medicoNombre} />

            {/* Video area */}
            <div className="flex-1 min-h-0">
              <VideoArea />
            </div>

            {/* Footer: mic + cam + info + salir */}
            <MicCamProvider>
              {({ micOn, camOn, toggleMic, toggleCam, micError, camError }) => (
                <>
                {/* Banner de error mic/cam — sobre el footer */}
                {(micError || camError) && (
                  <div
                    className="flex items-center gap-2 px-4 py-2.5"
                    style={{ backgroundColor: "rgba(226,75,74,0.15)", borderTop: "1px solid rgba(226,75,74,0.3)" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
                    </svg>
                    <p className="text-xs text-white/90">{micError || camError}</p>
                  </div>
                )}
                {/* Hint: tocá el mic para hablar — solo la primera vez que el mic está apagado */}
                {!micOn && !micError && (
                  <div className="flex items-center justify-center px-4 py-1.5" style={{ backgroundColor: "rgba(55,138,221,0.15)" }}>
                    <p className="text-xs text-[#378ADD]">Tocá el botón del micrófono para que te escuchen</p>
                  </div>
                )}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderTop: "0.5px solid rgba(255,255,255,0.1)" }}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleMic}
                      className={`rounded-full p-3 transition ${micOn ? "bg-white/10 text-white hover:bg-white/20" : "bg-red-600 text-white animate-pulse"}`}
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowEstudios(!showEstudios)}
                      className={`rounded-lg px-4 py-2 text-xs font-medium transition ${
                        showEstudios
                          ? "bg-[#378ADD] text-white"
                          : "text-white/60 hover:text-white hover:bg-white/10"
                      }`}
                      style={{ minHeight: "44px" }}
                    >
                      Estudios
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSalirDialog(true)}
                      className="rounded-lg px-4 py-2 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition"
                      style={{ minHeight: "44px" }}
                    >
                      Salir
                    </button>
                  </div>
                </div>
                </>
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

      {/* Dialog confirmación salir */}
      {showSalirDialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">¿Salir de la consulta?</h2>
            <p className="mt-2 text-sm text-gray-600">
              Si salís ahora, vas a abandonar la videollamada con tu médico. Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowSalirDialog(false)}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                style={{ minHeight: "44px" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => router.push("/mis-consultas")}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white transition"
                style={{ minHeight: "44px", backgroundColor: "#E24B4A", border: "1px solid #E24B4A" }}
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel de estudios — slide up overlay */}
      {showEstudios && estado === "en_curso" && (
        <div
          className="absolute inset-x-0 bottom-0 z-50 max-h-[60dvh] overflow-y-auto rounded-t-2xl bg-white shadow-xl"
          style={{ borderTop: "2px solid #378ADD" }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
            <p className="text-sm font-medium text-gray-900">Estudios</p>
            <button
              type="button"
              onClick={() => setShowEstudios(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
              style={{ minHeight: "44px", minWidth: "44px" }}
            >
              Cerrar
            </button>
          </div>
          <div className="px-4 pb-6">
            <EstudiosPaciente consultaId={consultaId} />
          </div>
        </div>
      )}
    </div>
  );
}
