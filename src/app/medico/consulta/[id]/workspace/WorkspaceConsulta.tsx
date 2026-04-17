"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useTracks,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { createClient } from "@/lib/supabase/client";
import { useAutoSaveBorrador } from "@/hooks/useAutoSaveBorrador";
import LoadingButton from "@/components/ui/LoadingButton";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function calcularEdad(fechaNac: string | null): string {
  if (!fechaNac) return "";
  const hoy = new Date();
  const nac = new Date(fechaNac);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} a\u00f1os`;
}

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
// Dictado por voz
// ---------------------------------------------------------------------------

function useDictado() {
  const recRef = useRef<any>(null);
  const [dictando, setDictando] = useState<string | null>(null);

  const iniciar = useCallback(
    (campo: string, setter: (fn: (prev: string) => string) => void) => {
      if (typeof window === "undefined") return;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;

      const rec = new SR();
      rec.lang = "es-AR";
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (e: any) => {
        let transcript = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        if (e.results[e.results.length - 1].isFinal) {
          setter((prev) => (prev ? prev + " " : "") + transcript);
        }
      };

      rec.onerror = () => detener();
      rec.onend = () => setDictando(null);

      recRef.current = rec;
      setDictando(campo);
      rec.start();
    },
    []
  );

  const detener = useCallback(() => {
    if (recRef.current) {
      recRef.current.stop();
      recRef.current = null;
    }
    setDictando(null);
  }, []);

  return { dictando, iniciar, detener };
}

// ---------------------------------------------------------------------------
// Campo con dictado
// ---------------------------------------------------------------------------

function CampoDictado({
  label,
  campo,
  value,
  setter,
  placeholder,
  rows = 3,
  required = false,
  hasError = false,
  textareaRef,
  dictando,
  onIniciar,
  onDetener,
}: {
  label: string;
  campo: string;
  value: string;
  setter: (v: string) => void;
  placeholder: string;
  rows?: number;
  required?: boolean;
  hasError?: boolean;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
  dictando: string | null;
  onIniciar: () => void;
  onDetener: () => void;
}) {
  const activo = dictando === campo;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className={`text-xs font-medium tracking-wide ${hasError ? "text-[#E24B4A]" : "text-gray-400"}`}>
          {label}
          {required && " *"}
        </p>
        <button
          type="button"
          onMouseDown={onIniciar}
          onMouseUp={onDetener}
          onTouchStart={onIniciar}
          onTouchEnd={onDetener}
          className={`rounded-md px-2 py-1 text-xs transition ${
            activo
              ? "bg-red-100 text-red-600"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
          style={{ minHeight: "44px", minWidth: "44px" }}
        >
          {activo ? "Dictando..." : "Dictar"}
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setter(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`mt-1.5 w-full resize-none rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 ${hasError ? "focus:ring-[#E24B4A]" : "focus:ring-[#1D9E75]"}`}
        style={{ border: `${hasError ? "1.5px" : "0.5px"} solid ${hasError ? "#E24B4A" : "#e5e7eb"}` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type DocBorrador = {
  diagnostico?: string;
  receta?: string;
  indicaciones?: string;
  certificado?: string;
  updated_at?: string;
} | null;

type Props = {
  consultaId: string;
  medicoId: string;
  livekitToken: string | null;
  roomName: string | null;
  videoError: string | null;
  horaInicio: string;
  consulta: {
    especialidad: string;
    motivo_consulta: string | null;
    sintomas: string[] | null;
    tiempo_sintomas: string | null;
    paciente_nombre: string;
    paciente_nacimiento: string | null;
    paciente_cuil: string | null;
    paciente_id: string;
    doc_borrador?: DocBorrador;
  };
};

// ---------------------------------------------------------------------------
// Video area — tracks de LiveKit + controles propios mic/cam
// ---------------------------------------------------------------------------

function VideoArea() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  const cols = tracks.length > 1 ? "grid-cols-2" : "grid-cols-1";
  return (
    <div className={`grid ${cols} gap-1 h-full w-full`}>
      {tracks.map((trackRef) => (
        <div
          key={`${trackRef.participant.identity}-${trackRef.source}`}
          className="relative bg-gray-800 overflow-hidden flex items-center justify-center"
        >
          {trackRef.publication && !trackRef.publication.isMuted ? (
            <VideoTrack
              trackRef={trackRef}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="h-20 w-20 rounded-full bg-gray-600 flex items-center justify-center">
                <span className="text-2xl text-gray-300">
                  {trackRef.participant.name?.[0]?.toUpperCase() || "?"}
                </span>
              </div>
            </div>
          )}
          <span className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
            {trackRef.participant.name || "Participante"}
          </span>
        </div>
      ))}
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

// Hook para controles mic/cam — usado por el footer FUERA de LiveKitRoom
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

// Wrapper que provee controles mic/cam via render prop
function MicCamProvider({ children }: { children: (controls: { micOn: boolean; camOn: boolean; toggleMic: () => void; toggleCam: () => void }) => React.ReactNode }) {
  const controls = useMicCam();
  return <>{children(controls)}</>;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function WorkspaceConsulta({
  consultaId,
  medicoId,
  livekitToken,
  roomName,
  videoError: videoErrorProp,
  horaInicio,
  consulta,
}: Props) {
  const router = useRouter();

  // --- Estado campos clinicos ---
  const borrador = consulta.doc_borrador;
  const [diagnostico, setDiagnostico] = useState(borrador?.diagnostico ?? "");
  const [receta, setReceta] = useState(borrador?.receta ?? "");
  const [indicaciones, setIndicaciones] = useState(borrador?.indicaciones ?? "");
  const [certificado, setCertificado] = useState(borrador?.certificado ?? "");

  // --- UI state ---
  const [finalizando, setFinalizando] = useState(false);
  const [iframeVisible, setIframeVisible] = useState(true);
  const [error, setError] = useState<string | null>(videoErrorProp);
  const [timerSeg, setTimerSeg] = useState(0);
  const [guardadoManual, setGuardadoManual] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showSalirDialog, setShowSalirDialog] = useState(false);

  // Mobile: dos modos explícitos. false = video, true = escritura.
  const [modoEscritura, setModoEscritura] = useState(false);
  const [diagError, setDiagError] = useState(false);
  const diagRef = useRef<HTMLTextAreaElement>(null);
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "";

  // --- Auto-save ---
  const { estado: estadoBorrador } = useAutoSaveBorrador(consultaId, "consulta", {
    diagnostico,
    receta,
    indicaciones,
    certificado,
  });

  // --- Dictado ---
  const { dictando, iniciar: iniciarDictado, detener: detenerDictado } = useDictado();

  // --- Datos derivados ---
  const edad = calcularEdad(consulta.paciente_nacimiento);

  // --- Timer ---
  useEffect(() => {
    const inicio = new Date(horaInicio).getTime();
    const calcular = () => {
      const diff = Math.max(0, Math.floor((Date.now() - inicio) / 1000));
      setTimerSeg(diff);
    };
    calcular();
    const i = setInterval(calcular, 1000);
    return () => clearInterval(i);
  }, [horaInicio]);

  // Helper: validar diagnóstico antes de finalizar
  function validarDiagnostico(): boolean {
    if (diagnostico.trim()) return true;
    setError("Completá el diagnóstico antes de finalizar la consulta.");
    setDiagError(true);
    setModoEscritura(true);
    setTimeout(() => diagRef.current?.focus(), 350); // después de la transición CSS
    return false;
  }

  // --- Finalizar consulta ---
  async function finalizarConsulta() {
    if (!validarDiagnostico()) return;

    // Validación CUIL síncrona antes de cualquier async
    if (receta.trim() && !consulta.paciente_cuil) {
      setError("El paciente no tiene CUIL registrado. No es posible generar una receta (Ley 27.553). Pedile que complete sus datos desde /mis-datos.");
      return;
    }

    // 1. Ocultar video inmediatamente
    setIframeVisible(false);

    // 2. Eliminar sala LiveKit → desconecta al paciente
    if (roomName) {
      fetch("/api/livekit/crear-sala", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName }),
      }).catch(() => {});
    }

    // 3. Navegar al dashboard sin esperar Supabase
    router.push("/dashboard");

    // 4. Guardar documentos y cerrar consulta en background (fire-and-forget)
    (async () => {
      try {
        const supabase = createClient();

        const { data: consultaDb } = await supabase
          .from("consultas")
          .select("estado, paciente_id, medico_id")
          .eq("id", consultaId)
          .single();

        if (!consultaDb?.paciente_id) return;
        if (consultaDb.estado === "completada") return;

        // Lookup: paciente_id en consultas es auth.users.id, documentos necesita pacientes.id
        const { data: paciente } = await supabase
          .from("pacientes")
          .select("id")
          .eq("user_id", consultaDb.paciente_id)
          .single();

        const { data: medico } = await supabase
          .from("medicos")
          .select("id")
          .eq("id", consultaDb.medico_id)
          .single();

        if (!paciente || !medico) return;

        const docs: { tipo: string; contenido: string }[] = [];
        if (receta.trim()) docs.push({ tipo: "receta", contenido: receta.trim() });
        if (indicaciones.trim())
          docs.push({ tipo: "indicaciones", contenido: indicaciones.trim() });
        if (certificado.trim())
          docs.push({ tipo: "certificado", contenido: certificado.trim() });
        if (docs.length === 0)
          docs.push({ tipo: "indicaciones", contenido: diagnostico.trim() });

        await supabase.from("documentos").insert(
          docs.map((d) => ({
            consulta_id: consultaId,
            turno_id: null,
            paciente_id: paciente.id,
            medico_id: medico.id,
            tipo: d.tipo,
            diagnostico: diagnostico.trim(),
            contenido: d.contenido,
          }))
        );

        await supabase
          .from("consultas")
          .update({ estado: "completada", doc_borrador: null })
          .eq("id", consultaId);
      } catch {
        // Background: no hay UI para mostrar error, falla silenciosamente
      }
    })();
  }

  // --- Cancelar consulta ---
  async function cancelarConsulta() {
    try {
      const res = await fetch(`/api/consulta/${consultaId}/cancelar-medico`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Error al cancelar la consulta.");
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setError("Error de conexion al cancelar.");
    }
  }

  // --- Guardar documentos manual ---
  async function guardarDocumentos() {
    setGuardadoManual('saving');
    try {
      const res = await fetch(`/api/consulta/${consultaId}/borrador`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "consulta",
          borrador: {
            diagnostico,
            receta,
            indicaciones,
            certificado,
            updated_at: new Date().toISOString(),
          },
        }),
      });
      if (!res.ok) {
        setGuardadoManual('idle');
        setError("Error al guardar documentos.");
        return;
      }
      setGuardadoManual('saved');
      setTimeout(() => setGuardadoManual('idle'), 2000);
    } catch {
      setGuardadoManual('idle');
      setError("Error de conexion al guardar.");
    }
  }

  // --- Render ---
  return (
    <div className="flex h-[100dvh] flex-col md:flex-row overflow-hidden bg-[#f8f9fa]">
      {/* ================================================================ */}
      {/* COLUMNA IZQUIERDA / ARRIBA — Video                               */}
      {/* ================================================================ */}
      <div
        className={`relative flex w-full flex-col bg-gray-900 transition-all duration-300 ease-in-out ${
          modoEscritura
            ? "h-[80px] min-h-[80px]"
            : "h-[75dvh] min-h-[200px]"
        } md:h-auto md:min-h-0 md:w-[60%] md:flex-1`}
      >
        {/* Barra compacta modo escritura (solo mobile) */}
        <div
          className={`flex items-center justify-between px-4 ${
            modoEscritura ? "py-2" : "py-3"
          } md:py-3`}
          style={{ borderBottom: "0.5px solid rgba(255,255,255,0.1)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#1D9E75]" />
            {modoEscritura ? (
              <span className="text-xs text-white/70 truncate md:hidden">
                Llamada activa
              </span>
            ) : null}
            {/* Desktop siempre muestra nombre */}
            <span className={`text-sm font-medium text-white truncate ${modoEscritura ? "hidden md:inline" : ""}`}>
              {consulta.paciente_nombre}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs tabular-nums text-white/50">
              {formatTimer(timerSeg)}
            </span>
            {/* Botón volver al video (solo mobile, solo en modo escritura) */}
            {modoEscritura && (
              <button
                type="button"
                onClick={() => setModoEscritura(false)}
                className="md:hidden rounded-lg px-3 py-1.5 text-xs font-medium text-white bg-white/10 hover:bg-white/20 transition"
                style={{ minHeight: "44px", minWidth: "44px" }}
              >
                Volver al video
              </button>
            )}
            {/* Botón salir — siempre visible */}
            <button
              type="button"
              onClick={() => setShowSalirDialog(true)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition"
              style={{ minHeight: "44px", minWidth: "44px" }}
            >
              Salir
            </button>
          </div>
        </div>

        {/* Video + footer — todo dentro de LiveKitRoom para que los hooks funcionen */}
        {livekitToken && roomName && livekitUrl ? (
          <div className="flex flex-1 flex-col min-h-0" style={{ display: iframeVisible ? "flex" : "none" }}>
            <LiveKitRoom
              serverUrl={livekitUrl}
              token={livekitToken}
              connect={true}
              onDisconnected={() => setIframeVisible(false)}
              style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
            >
              <RoomAudioRenderer />

              {/* Video area — se oculta en mobile modo escritura */}
              <div
                className={`flex-1 w-full transition-all duration-300 ease-in-out ${
                  modoEscritura
                    ? "h-0 min-h-0 overflow-hidden md:h-auto md:min-h-0 md:overflow-visible"
                    : "min-h-0"
                }`}
              >
                <VideoArea />
              </div>

              {/* Footer con controles — render prop para acceder a mic/cam */}
              <MicCamProvider>
                {({ micOn, camOn, toggleMic, toggleCam }) => (
                  <>
                    {/* MOBILE footer: 3 filas. Solo visible en modo video */}
                    {!modoEscritura && (
                      <div
                        className="md:hidden px-4 py-3 space-y-3"
                        style={{ borderTop: "0.5px solid rgba(255,255,255,0.1)" }}
                      >
                        {/* Fila 1: Mic + Cam centrados */}
                        <div className="flex items-center justify-center gap-4">
                          <button
                            type="button"
                            onClick={toggleMic}
                            className={`rounded-full p-3 transition ${micOn ? "bg-white/10 text-white" : "bg-red-600 text-white"}`}
                            style={{ minHeight: "48px", minWidth: "48px" }}
                          >
                            <MicIcon on={micOn} />
                          </button>
                          <button
                            type="button"
                            onClick={toggleCam}
                            className={`rounded-full p-3 transition ${camOn ? "bg-white/10 text-white" : "bg-red-600 text-white"}`}
                            style={{ minHeight: "48px", minWidth: "48px" }}
                          >
                            <CamIcon on={camOn} />
                          </button>
                        </div>
                        {/* Fila 2: Documentar full width */}
                        <button
                          type="button"
                          onClick={() => setModoEscritura(true)}
                          className="w-full rounded-xl bg-[#378ADD] py-3 text-sm font-medium text-white active:scale-95 transition-all duration-100"
                          style={{ minHeight: "48px" }}
                        >
                          Documentar
                        </button>
                        {/* Fila 3: Finalizar full width */}
                        <LoadingButton
                          type="button"
                          isLoading={finalizando}
                          onClick={() => {
                            if (!validarDiagnostico()) return;
                            setShowConfirmDialog(true);
                          }}
                          className="w-full rounded-xl py-3 text-sm font-medium text-white transition-all duration-100 active:scale-95 disabled:opacity-50"
                          style={{ backgroundColor: "#7BAFD4", minHeight: "48px" }}
                        >
                          Finalizar consulta
                        </LoadingButton>
                      </div>
                    )}

                    {/* DESKTOP footer: mic/cam + timer */}
                    <div
                      className="hidden md:flex items-center justify-center gap-3 px-4 py-2"
                      style={{ borderTop: "0.5px solid rgba(255,255,255,0.1)" }}
                    >
                      <button
                        type="button"
                        onClick={toggleMic}
                        className={`rounded-full p-2 transition ${micOn ? "bg-white/10 text-white hover:bg-white/20" : "bg-red-600 text-white"}`}
                      >
                        <MicIcon on={micOn} />
                      </button>
                      <button
                        type="button"
                        onClick={toggleCam}
                        className={`rounded-full p-2 transition ${camOn ? "bg-white/10 text-white hover:bg-white/20" : "bg-red-600 text-white"}`}
                      >
                        <CamIcon on={camOn} />
                      </button>
                      <span className="text-xs tabular-nums text-white/40 ml-2">
                        {formatTimer(timerSeg)}
                      </span>
                    </div>
                  </>
                )}
              </MicCamProvider>
            </LiveKitRoom>
          </div>
        ) : (
          <div className={`flex-1 w-full ${modoEscritura ? "h-0 min-h-0 overflow-hidden md:h-auto md:min-h-0 md:overflow-visible" : "min-h-0"}`}>
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-white/50">
                {error || "Conectando video..."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* COLUMNA DERECHA / ABAJO — Documentacion                          */}
      {/* En mobile: solo visible en modo escritura                        */}
      {/* En desktop: siempre visible (split 60/40)                        */}
      {/* ================================================================ */}
      <div
        className={`flex-1 overflow-y-auto md:w-[40%] md:flex-none ${
          modoEscritura ? "" : "hidden md:block"
        }`}
        style={{ borderLeft: "0.5px solid #e5e7eb" }}
      >
        <div className="p-5">
          {/* Info paciente (solo desktop) */}
          <div className="hidden md:block">
            <p className="text-xs font-medium tracking-wide text-gray-400">
              PACIENTE
            </p>
            <p className="mt-2 text-lg font-medium text-gray-900">
              {consulta.paciente_nombre}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              {[edad, consulta.especialidad].filter(Boolean).join(" \u00b7 ")}
            </p>

            {consulta.motivo_consulta && (
              <div className="mt-4">
                <p className="text-xs font-medium tracking-wide text-gray-400">
                  MOTIVO
                </p>
                <p className="mt-1 text-sm text-gray-700">
                  {consulta.motivo_consulta}
                </p>
              </div>
            )}

            {consulta.tiempo_sintomas && (
              <div className="mt-3">
                <p className="text-xs font-medium tracking-wide text-gray-400">
                  TIEMPO
                </p>
                <p className="mt-0.5 text-xs text-gray-600">
                  {consulta.tiempo_sintomas}
                </p>
              </div>
            )}

            {consulta.sintomas && consulta.sintomas.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium tracking-wide text-gray-400">
                  SINTOMAS
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {consulta.sintomas.map((s) => (
                    <span
                      key={s}
                      className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-600"
                      style={{ border: "0.5px solid #e5e7eb" }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div
              className="mt-5 border-t pt-4"
              style={{ borderColor: "#e5e7eb" }}
            />
          </div>

          {/* Info paciente mobile (visible solo en mobile, en modo escritura) */}
          <div className="md:hidden mb-4">
            <p className="text-sm font-medium text-gray-900">
              {consulta.paciente_nombre}
            </p>
            <p className="text-xs text-gray-500">
              {[edad, consulta.especialidad].filter(Boolean).join(" \u00b7 ")}
            </p>
            {consulta.motivo_consulta && (
              <p className="mt-2 text-xs text-gray-600">
                {consulta.motivo_consulta}
              </p>
            )}
          </div>

          {/* Auto-save indicator */}
          {estadoBorrador !== "idle" && (
            <p
              className={`text-xs ${
                estadoBorrador === "saving"
                  ? "text-gray-400"
                  : estadoBorrador === "saved"
                    ? "text-[#1D9E75]"
                    : "text-[#E24B4A]"
              }`}
            >
              {estadoBorrador === "saving" && "Guardando borrador..."}
              {estadoBorrador === "saved" && "Borrador guardado"}
              {estadoBorrador === "error" && "Error al guardar borrador"}
            </p>
          )}

          {/* Error */}
          {error && (
            <div className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Campos */}
          <CampoDictado
            label="DIAGNOSTICO"
            campo="diagnostico"
            value={diagnostico}
            setter={(v) => { setDiagnostico(v); if (v.trim()) { setDiagError(false); setError(null); } }}
            placeholder="Diagnostico del paciente..."
            required
            hasError={diagError}
            textareaRef={diagRef}
            dictando={dictando}
            onIniciar={() => iniciarDictado("diagnostico", (fn) => setDiagnostico((prev) => { const val = fn(prev); if (val.trim()) { setDiagError(false); setError(null); } return val; }))}
            onDetener={detenerDictado}
          />
          <CampoDictado
            label="RECETA"
            campo="receta"
            value={receta}
            setter={setReceta}
            placeholder="Medicamentos, dosis, frecuencia..."
            dictando={dictando}
            onIniciar={() => iniciarDictado("receta", setReceta)}
            onDetener={detenerDictado}
          />
          <CampoDictado
            label="INDICACIONES"
            campo="indicaciones"
            value={indicaciones}
            setter={setIndicaciones}
            placeholder="Reposo, estudios, derivaciones..."
            dictando={dictando}
            onIniciar={() => iniciarDictado("indicaciones", setIndicaciones)}
            onDetener={detenerDictado}
          />
          <CampoDictado
            label="CERTIFICADO"
            campo="certificado"
            value={certificado}
            setter={setCertificado}
            placeholder="Certificado medico..."
            dictando={dictando}
            onIniciar={() => iniciarDictado("certificado", setCertificado)}
            onDetener={detenerDictado}
          />

          {/* Acciones sticky — modo escritura: guardar + volver; desktop: finalizar + cancelar */}
          <div
            className="sticky bottom-0 mt-6 bg-[#f8f9fa] pb-5 pt-3"
            style={{ borderTop: "0.5px solid #e5e7eb" }}
          >
            {/* Mobile modo escritura: Guardar + Volver + Finalizar */}
            <div className="md:hidden flex flex-col gap-2">
              <LoadingButton
                type="button"
                isLoading={guardadoManual === 'saving'}
                onClick={guardarDocumentos}
                className="w-full rounded-xl bg-[#7BAFD4] px-6 py-3.5 text-sm font-medium text-white transition-all duration-100 hover:bg-[#6A9FC4] active:scale-95 active:opacity-80 disabled:opacity-50"
                style={{ minHeight: "44px" }}
              >
                {guardadoManual === 'saved' ? "\u2713 Guardado" : "Guardar documentos"}
              </LoadingButton>
              <button
                type="button"
                onClick={() => setModoEscritura(false)}
                className="w-full rounded-xl px-6 py-3.5 text-sm font-medium text-white transition-all duration-100 active:scale-95 active:opacity-80"
                style={{ backgroundColor: "#378ADD", minHeight: "44px" }}
              >
                Volver a la llamada
              </button>
              <LoadingButton
                type="button"
                isLoading={finalizando}
                onClick={() => {
                  if (!validarDiagnostico()) return;
                  setShowConfirmDialog(true);
                }}
                className="w-full rounded-xl px-6 py-3.5 text-sm font-medium text-white transition-all duration-100 active:scale-95 active:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: "#E57373", minHeight: "48px" }}
              >
                Finalizar y generar documentos
              </LoadingButton>
            </div>

            {/* Desktop: finalizar + cancelar */}
            <div className="hidden md:flex md:flex-col md:gap-2">
              <LoadingButton
                isLoading={finalizando}
                onClick={() => {
                  if (!validarDiagnostico()) return;
                  setShowConfirmDialog(true);
                }}
                className="w-full rounded-xl bg-[#7BAFD4] px-6 py-3.5 text-sm font-medium text-white transition-all duration-100 hover:bg-[#6A9FC4] active:scale-95 active:opacity-80 disabled:opacity-50"
                style={{ minHeight: "44px" }}
              >
                Finalizar y generar documentos
              </LoadingButton>
              <button
                onClick={() => setShowCancelDialog(true)}
                className="w-full rounded-xl px-6 py-3 text-sm font-medium transition-all duration-100 active:scale-95 active:opacity-80"
                style={{ color: "#E24B4A", minHeight: "44px" }}
              >
                Cancelar consulta
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dialog de cancelación — reemplaza window.confirm() que Chrome suprime en páginas con iframes cross-origin */}
      {showCancelDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "360px",
              width: "100%",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#111",
                marginBottom: "8px",
              }}
            >
              Cancelar consulta
            </h3>
            <p
              style={{
                fontSize: "14px",
                color: "#666",
                marginBottom: "24px",
              }}
            >
              ¿Estás seguro que querés cancelar esta consulta?
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowCancelDialog(false)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  background: "white",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Volver
              </button>
              <button
                onClick={() => {
                  setShowCancelDialog(false);
                  cancelarConsulta();
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#E24B4A",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancelar consulta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog de confirmación — reemplaza window.confirm() que Chrome suprime en páginas con iframes cross-origin */}
      {showConfirmDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "360px",
              width: "100%",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#111",
                marginBottom: "8px",
              }}
            >
              Finalizar consulta
            </h3>
            <p
              style={{
                fontSize: "14px",
                color: "#666",
                marginBottom: "24px",
              }}
            >
              ¿Finalizar y generar los documentos para el paciente?
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowConfirmDialog(false)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  background: "white",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  finalizarConsulta();
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#7BAFD4",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Finalizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog de salir — médico: ofrece finalizar o solo salir */}
      {showSalirDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "360px",
              width: "100%",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#111",
                marginBottom: "8px",
              }}
            >
              Salir de la consulta
            </h3>
            <p
              style={{
                fontSize: "14px",
                color: "#666",
                marginBottom: "24px",
              }}
            >
              ¿Qué querés hacer?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={() => {
                  setShowSalirDialog(false);
                  if (!validarDiagnostico()) return;
                  setShowConfirmDialog(true);
                }}
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#7BAFD4",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Finalizar y generar documentos
              </button>
              <button
                onClick={() => {
                  setShowSalirDialog(false);
                  router.push("/dashboard");
                }}
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  background: "white",
                  fontSize: "14px",
                  color: "#666",
                  cursor: "pointer",
                }}
              >
                Salir sin finalizar
              </button>
              <button
                onClick={() => setShowSalirDialog(false)}
                style={{
                  padding: "8px",
                  border: "none",
                  background: "none",
                  fontSize: "13px",
                  color: "#999",
                  cursor: "pointer",
                }}
              >
                Volver a la consulta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
