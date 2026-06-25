"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

import { useEffect, useRef, useState, useCallback, forwardRef } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useTracks,
  useLocalParticipant,
  useDataChannel,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { createClient } from "@/lib/supabase/client";
import { useAutoSaveBorrador } from "@/hooks/useAutoSaveBorrador";
import LoadingButton from "@/components/ui/LoadingButton";
import MedicamentoAutocomplete, { type MedicamentoReceta } from "@/components/MedicamentoAutocomplete";
import ModalDatosPaciente from "@/components/ModalDatosPaciente";
import { datosCoberturaCompletos, type DatosCobertura } from "@/lib/cobertura";
import { componerEvolucion, type DatosEvolucion } from "@/lib/evolucion/componer";
import PanelEstudios, { useEstudiosCount } from "./PanelEstudios";
import PanelHistoriaClinica from "./PanelHistoriaClinica";
import type { EntradaEvolucion } from "@/app/medico/paciente/[pacienteId]/EvolucionesTimeline";

type ModoWorkspace = "video" | "escritura" | "estudios" | "hc";

// Chips de acceso rápido para el reposo del certificado. Dos grupos: HORAS para
// el reposo corto (24/48/72 hs) y DÍAS para el largo (4/5/6 + "Otro" para cualquier
// número). Un médico de 70 años prefiere tocar a tipear. La selección es obligatoria,
// no hay default (decisión Diego).
//
// Modelo de datos: el reposo se persiste SIEMPRE como `dias_reposo` (entero, días
// calendario, para el rango "desde X hasta Y"). Las horas mapean a días: 24→1, 48→2,
// 72→3. Como las horas solo cubren 1-3 días y los días arrancan en 4, el PDF deriva
// la unidad sin ambigüedad: dias_reposo ≤ 3 se muestra en horas, ≥ 4 en días.
const HORAS_REPOSO_RAPIDAS: number[] = [24, 48, 72];
const DIAS_REPOSO_RAPIDOS: number[] = [4, 5, 6];

// ---------------------------------------------------------------------------
// AccordionSection — secciones colapsables del panel de documentación
// ---------------------------------------------------------------------------
function AccordionSection({ title, hasContent, forceOpen, children }: { title: string; hasContent: boolean; forceOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Apertura programática (ej: el guard del certificado abre la sección al fallar).
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-1 text-left"
      >
        <div className="flex items-center gap-2">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-gray-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="text-xs font-medium tracking-wide text-gray-400">{title}</span>
          {!open && hasContent && (
            <span className="inline-block h-2 w-2 rounded-full bg-[#1D9E75]" />
          )}
        </div>
      </button>
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? 1000 : 0, opacity: open ? 1 : 0 }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function calcularEdadNumero(fechaNac: string | null): number | null {
  if (!fechaNac) return null;
  const hoy = new Date();
  const nac = new Date(fechaNac);
  if (Number.isNaN(nac.getTime())) return null;
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad >= 0 ? edad : null;
}

function calcularEdad(fechaNac: string | null): string {
  const edad = calcularEdadNumero(fechaNac);
  return edad === null ? "" : `${edad} a\u00f1os`;
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
// Serialización de medicamentos estructurados a texto para PDF/documentos
// ---------------------------------------------------------------------------

// Formato IFA compatible con AAIP/ReNaPDiS — cada medicamento con Rp/ + IFA + detalles
function serializarMedicamentos(meds: MedicamentoReceta[], textoLibre: string): string {
  const bloques: string[] = [];
  for (let i = 0; i < meds.length; i++) {
    const med = meds[i];
    const nombre = (med.nombre ?? "").trim();
    if (!nombre) continue;

    const lineas: string[] = [];
    // IFA (droga) como línea principal — formato prescripción
    const ifa = (med.droga ?? "").trim();
    lineas.push(`Rp/ ${ifa ? ifa.toUpperCase() : nombre.toUpperCase()}`);
    if (ifa && nombre !== ifa) {
      lineas.push(`    Nombre comercial: ${nombre}`);
    }
    if (med.forma_farmaceutica?.trim()) {
      lineas.push(`    Forma farmacéutica: ${capitalizar(med.forma_farmaceutica.trim())}`);
    }
    if (med.presentacion?.trim()) {
      lineas.push(`    Presentación: ${med.presentacion.trim()}`);
    }
    if (med.via?.trim()) {
      lineas.push(`    Vía: ${med.via.trim()}`);
    }
    bloques.push(lineas.join("\n"));
  }

  if ((textoLibre ?? "").trim()) {
    if (bloques.length > 0) bloques.push("");
    bloques.push(textoLibre.trim());
  }
  return bloques.join("\n\n");
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parsearMedicamentosBorrador(borrador: any): { meds: MedicamentoReceta[]; textoLibre: string } {
  if (borrador?.medicamentos_structured && Array.isArray(borrador.medicamentos_structured)) {
    const meds = borrador.medicamentos_structured.map((m: any) => ({
      id: m.id ?? `med_${Date.now()}_${Math.random()}`,
      nombre: m.nombre ?? "",
      droga: m.droga ?? "",
      presentacion: m.presentacion ?? "",
      forma_farmaceutica: m.forma_farmaceutica ?? "",
      via: m.via ?? "",
    }));
    return {
      meds,
      textoLibre: borrador.receta_texto_libre ?? "",
    };
  }
  return { meds: [], textoLibre: borrador?.receta ?? "" };
}

// ---------------------------------------------------------------------------
// Dictado por voz
// ---------------------------------------------------------------------------

function useDictado() {
  const recRef = useRef<any>(null);
  // Modo DISCRETO (continuous=false): con continuous=true, Chrome-Android emite finales
  // ACUMULATIVOS → cascada ("la → la me → la me puedes → ..."). Una frase por sesión +
  // reinicio en onend para soportar pausas. Bug del motor (Chromium 40324711), no nuestro.
  const detenidoManual = useRef(false);
  const acumuladoRef = useRef("");   // texto confirmado del campo (base + frases cerradas)
  const ultimoFinalRef = useRef(""); // final de la sesión en curso (se consolida en onend)
  const [dictando, setDictando] = useState<string | null>(null);

  const soportado =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const detener = useCallback(() => {
    detenidoManual.current = true;
    if (recRef.current) {
      try { recRef.current.stop(); } catch { /* ya detenido */ }
      recRef.current = null;
    }
    setDictando(null);
  }, []);

  const iniciar = useCallback(
    (campo: string, setter: (fn: (prev: string) => string) => void) => {
      if (typeof window === "undefined") return;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;

      // Cambio de campo sin "Detener": cerramos y neutralizamos el rec previo para que
      // no reinicie ni contamine el nuevo campo (acumuladoRef/ultimoFinalRef son
      // compartidas). Hallazgo de Roberto.
      if (recRef.current) {
        const viejo = recRef.current;
        viejo.onresult = null; viejo.onend = null; viejo.onerror = null;
        try { viejo.stop(); } catch { /* ya detenido */ }
        recRef.current = null;
      }

      const rec = new SR();
      rec.lang = "es-AR";
      rec.continuous = false; // ← clave: una frase por sesión (anti-cascada Android)
      rec.interimResults = true;
      detenidoManual.current = false;
      setter((prev) => { acumuladoRef.current = prev; ultimoFinalRef.current = ""; return prev; });

      rec.onresult = (e: any) => {
        // Final/interim MÁS LARGO del evento (no concatenar) → inmune a la cascada acumulativa.
        let finalSesion = "";
        let interim = "";
        for (let i = 0; i < e.results.length; i++) {
          const t = (e.results[i][0]?.transcript || "").trim();
          if (!t) continue;
          if (e.results[i].isFinal) { if (t.length > finalSesion.length) finalSesion = t; }
          else if (t.length > interim.length) interim = t;
        }
        ultimoFinalRef.current = finalSesion;
        const conf = acumuladoRef.current;
        setter(() => (conf ? conf + " " : "") + (finalSesion || interim));
      };

      rec.onerror = (ev: any) => {
        // Solo fatales detienen; 'no-speech'/'aborted' (pausas) → onend reinicia.
        const err = ev?.error;
        if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture") detener();
      };

      rec.onend = () => {
        if (ultimoFinalRef.current) {
          acumuladoRef.current = (acumuladoRef.current ? acumuladoRef.current + " " : "") + ultimoFinalRef.current;
          ultimoFinalRef.current = "";
        }
        // Reiniciar para seguir dictando a través de la pausa. Delay chico: start()
        // inmediato en onend tira InvalidStateError.
        if (!detenidoManual.current && recRef.current === rec) {
          setTimeout(() => {
            if (!detenidoManual.current && recRef.current === rec) {
              try { rec.start(); } catch { /* ya corriendo */ }
            }
          }, 120);
        } else {
          setDictando(null);
        }
      };

      recRef.current = rec;
      setDictando(campo);
      rec.start();
    },
    [detener]
  );

  return { dictando, iniciar, detener, soportado };
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
  soportado = true,
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
  soportado?: boolean;
}) {
  const activo = dictando === campo;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className={`text-xs font-medium tracking-wide ${hasError ? "text-[#E24B4A]" : "text-gray-400"}`}>
          {label}
          {required && " *"}
        </p>
        {soportado ? (
          <button
            type="button"
            onClick={activo ? onDetener : onIniciar}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition ${
              activo
                ? "bg-red-600 text-white animate-pulse"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            style={{ minHeight: "44px", minWidth: "44px" }}
          >
            {/* Mic icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
            {activo ? "Detener" : "Dictar"}
          </button>
        ) : (
          <button
            type="button"
            aria-disabled="true"
            className="rounded-md px-2 py-1 text-xs bg-gray-100 text-gray-500"
            style={{ minHeight: "44px", minWidth: "44px", opacity: 0.5, cursor: "not-allowed" }}
          >
            No disponible
          </button>
        )}
      </div>
      {!soportado && (
        <p style={{ fontSize: "13px", color: "#888780", marginTop: "4px" }}>
          Dictado no disponible en Safari. Usá Chrome en computadora.
        </p>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setter(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`mt-1.5 w-full resize-none rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 ${hasError ? "focus:ring-[#E24B4A]" : "focus:ring-[#378ADD]"}`}
        style={{ border: `${activo ? "1.5px" : hasError ? "1.5px" : "0.5px"} solid ${activo ? "#378ADD" : hasError ? "#E24B4A" : "#e5e7eb"}` }}
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
  // Días de reposo del certificado (dato jurídico estructurado, art. 210 LCT).
  dias_reposo?: number | null;
  orden?: string;
  evolucion?: string;
  comentario?: string;
  evolucion_editada?: boolean;
  updated_at?: string;
  medicamentos_structured?: MedicamentoReceta[];
  receta_texto_libre?: string;
} | null;

type Props = {
  consultaId: string;
  medicoId: string;
  // Canal: "consulta" (CI) o "turno". Parametriza tabla, FK del paciente y estado
  // de cierre. El componente es uno solo; el comportamiento se ramifica por aquí.
  tipo?: "consulta" | "turno";
  livekitToken: string | null;
  roomName: string | null;
  videoError: string | null;
  horaInicio: string;
  // Evoluciones PREVIAS del paciente (CI + turnos completados con evolución del
  // MISMO paciente, EXCLUYENDO el encuentro actual), ordenadas nueva→vieja.
  // Alimentan el Panel HC. Default [] para no romper si la página no las pasa.
  evolucionesPrevias?: EntradaEvolucion[];
  consulta: {
    especialidad: string;
    motivo_consulta: string | null;
    sintomas: string[] | null;
    tiempo_sintomas: string | null;
    paciente_nombre: string;
    paciente_nacimiento: string | null;
    paciente_cuil: string | null;
    paciente_sexo_dni: string | null;
    paciente_id: string;
    paciente_cobertura: DatosCobertura;
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

  // Separar local vs remoto para layout PiP
  const remoteTracks = tracks.filter((t) => !t.participant.isLocal);
  const localTracks = tracks.filter((t) => t.participant.isLocal);
  const remoteTrack = remoteTracks[0] || null;
  const localTrack = localTracks[0] || null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Remoto — pantalla completa */}
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
            <span className="text-xs text-white/50">Esperando paciente...</span>
          </div>
        )}
      </div>

      {/* Local — PiP esquina inferior derecha */}
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

// Hook para controles mic/cam — usado por el footer FUERA de LiveKitRoom
function useMicCam() {
  const { localParticipant } = useLocalParticipant();
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);

  // Feedback optimista: el botón cambia AL INSTANTE (antes del await). En mobile
  // la primera activación de cámara/mic espera permiso + dispositivo (lento) → sin
  // esto el usuario cree que no pasó nada y vuelve a tocar. Revierte si falla.
  const toggleMic = useCallback(async () => {
    const next = !micOn;
    setMicOn(next);
    try {
      await localParticipant.setMicrophoneEnabled(next);
    } catch {
      setMicOn(!next);
    }
  }, [micOn, localParticipant]);

  const toggleCam = useCallback(async () => {
    const next = !camOn;
    setCamOn(next);
    try {
      await localParticipant.setCameraEnabled(next);
    } catch {
      setCamOn(!next);
    }
  }, [camOn, localParticipant]);

  return { micOn, camOn, toggleMic, toggleCam };
}

// Wrapper que provee controles mic/cam via render prop
function MicCamProvider({ children }: { children: (controls: { micOn: boolean; camOn: boolean; toggleMic: () => void; toggleCam: () => void }) => React.ReactNode }) {
  const controls = useMicCam();
  return <>{children(controls)}</>;
}

// ---------------------------------------------------------------------------
// Señalizador de dictado — envía estado via LiveKit Data Messages al paciente
// Debe renderizarse DENTRO de <LiveKitRoom>
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function DictadoSignaler({ dictando }: { dictando: string | null }) {
  const { send } = useDataChannel("dictado");
  const { localParticipant } = useLocalParticipant();
  const prevRef = useRef<boolean>(false);
  const prevMicRef = useRef<boolean>(false);

  useEffect(() => {
    const activo = dictando !== null;
    if (activo === prevRef.current) return;
    prevRef.current = activo;

    // Auto-mute LiveKit mic durante dictado para evitar competencia con Web Speech API
    if (activo) {
      prevMicRef.current = localParticipant.isMicrophoneEnabled;
      if (localParticipant.isMicrophoneEnabled) {
        localParticipant.setMicrophoneEnabled(false).catch(() => {});
      }
    } else {
      // Restaurar estado previo del mic
      if (prevMicRef.current) {
        localParticipant.setMicrophoneEnabled(true).catch(() => {});
      }
    }

    // Señalizar al paciente
    send(encoder.encode(JSON.stringify({ dictando: activo })), { reliable: true })
      .catch(() => {}); // fire-and-forget — si falla, el paciente simplemente no ve el banner
  }, [dictando, send, localParticipant]);

  return null; // componente invisible — solo lógica
}

// ---------------------------------------------------------------------------
// TarjetaEvolucion — documento de evolución con generación MANUAL y obligatoria.
//
// Dos estados, sin auto-pre-llenado (root cause del bug histórico: se generaba en
// la primera letra del diagnóstico y quedaba vieja):
//   1. inicial (no generada): botón primario "Generar evolución" + texto guía.
//      Chip "Pendiente" (ámbar). Sin textarea.
//   2. generada: textarea editable (el médico edita/agrega libre acá) + botón
//      secundario "Regenerar". Chip "Generada ✓" (verde). Gate satisfecho.
//
// Generar ES la validación humana. No hay un paso "Revisé y confirmo" aparte.
// Si cambian los campos fuente (diagnóstico/indicaciones/receta/certificado)
// DESPUÉS de generar, el componente vuelve al estado inicial (lo maneja el padre).
// ---------------------------------------------------------------------------

type TarjetaEvolucionProps = {
  generarBtnRef: React.RefObject<HTMLButtonElement | null>;
  evolucionGenerada: boolean;
  evolucion: string;
  onEvolucionChange: (v: string) => void;
  onGenerar: () => void;
  onRegenerar: () => void;
  pulseGenerar: boolean;
};

const TarjetaEvolucion = forwardRef<HTMLDivElement, TarjetaEvolucionProps>(
  function TarjetaEvolucion(
    {
      generarBtnRef,
      evolucionGenerada,
      evolucion,
      onEvolucionChange,
      onGenerar,
      onRegenerar,
      pulseGenerar,
    },
    ref
  ) {
    // Borde izquierdo: ámbar (pendiente) → verde (generada).
    const bordeColor = evolucionGenerada ? "#1D9E75" : "#BA7517";

    return (
      <div
        ref={ref}
        className="mt-4 rounded-lg bg-white"
        style={{ border: "0.5px solid #e5e7eb", borderLeft: `3px solid ${bordeColor}` }}
      >
        <div className="p-3">
          {/* Cabecera: label + chip de estado + Regenerar (solo si ya se generó) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium tracking-wide text-gray-400">EVOLUCION *</p>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={
                  evolucionGenerada
                    ? { backgroundColor: "rgba(29,158,117,0.12)", color: "#1D9E75" }
                    : { backgroundColor: "rgba(186,117,23,0.12)", color: "#BA7517" }
                }
              >
                {evolucionGenerada ? "Generada ✓" : "Pendiente"}
              </span>
            </div>

            {/* Regenerar — secundario, solo cuando ya hay evolución generada */}
            {evolucionGenerada && (
              <button
                type="button"
                onClick={onRegenerar}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs transition hover:bg-blue-50"
                style={{ color: "#378ADD", minHeight: "44px" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 2v6h6" />
                  <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
                </svg>
                Regenerar
              </button>
            )}
          </div>

          {/* Cuerpo */}
          {!evolucionGenerada ? (
            // Estado inicial: guía + botón primario full-width.
            <>
              <p className="mt-2 text-sm" style={{ color: "#888780" }}>
                Cargá los datos arriba y generá la evolución.
              </p>
              <button
                ref={generarBtnRef}
                type="button"
                onClick={onGenerar}
                className={`mt-3 w-full rounded-lg py-2.5 text-sm font-medium text-white transition active:scale-95 ${pulseGenerar ? "animate-pulse" : ""}`}
                style={{ backgroundColor: "#378ADD", minHeight: "44px" }}
              >
                Generar evolución
              </button>
            </>
          ) : (
            // Estado generado: textarea editable. El médico edita o agrega libre acá.
            <textarea
              value={evolucion}
              onChange={(e) => onEvolucionChange(e.target.value)}
              rows={6}
              placeholder="La evolución del paciente en esta consulta..."
              className="mt-2 w-full resize-none rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
              style={{ border: "0.5px solid #e5e7eb" }}
            />
          )}
        </div>
      </div>
    );
  }
);

// ---------------------------------------------------------------------------
// Chips de estado de campos obligatorios — fondo oscuro (footer de video)
// Verde #1D9E75 SOLO como indicador de estado (permitido por design system)
// ---------------------------------------------------------------------------

function ChipsEstadoObligatorios({ faltaDiagnostico, faltaEvolucion }: { faltaDiagnostico: boolean; faltaEvolucion: boolean }) {
  const chip = (label: string, falta: boolean) => (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{
        backgroundColor: falta ? "rgba(255,255,255,0.08)" : "rgba(29,158,117,0.18)",
        color: falta ? "rgba(255,255,255,0.55)" : "#5FD3AC",
      }}
    >
      {label} {falta ? "⋯" : "✓"}
    </span>
  );
  return (
    <div className="flex items-center justify-center gap-2">
      {chip("Diagnóstico", faltaDiagnostico)}
      {chip("Evolución", faltaEvolucion)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function WorkspaceConsulta({
  consultaId,
  medicoId,
  tipo = "consulta",
  livekitToken,
  roomName,
  videoError: videoErrorProp,
  horaInicio,
  evolucionesPrevias = [],
  consulta,
}: Props) {
  const router = useRouter();

  // --- Canal: tabla, estado de cierre y helper de lookup del pacientes.id ---
  // turnos.paciente_id YA ES pacientes.id (FK directo, verificado en prod).
  // consultas.paciente_id es auth.users.id → requiere lookup por user_id.
  const esTurno = tipo === "turno";
  const tablaPrincipal = esTurno ? "turnos" : "consultas";
  const estadoCompletado = esTurno ? "completado" : "completada";

  // Resuelve el pacientes.id real a partir del paciente_id del registro.
  // - turno: paciente_id ya es pacientes.id → se devuelve tal cual.
  // - consulta: paciente_id es auth.users.id → lookup por user_id.
  const resolverPacienteId = useCallback(
    async (
      supabase: ReturnType<typeof createClient>,
      pacienteIdRegistro: string
    ): Promise<string | null> => {
      if (esTurno) return pacienteIdRegistro;
      const { data } = await supabase
        .from("pacientes")
        .select("id")
        .eq("user_id", pacienteIdRegistro)
        .single();
      return data?.id ?? null;
    },
    [esTurno]
  );

  // --- Estado campos clinicos ---
  const borrador = consulta.doc_borrador;
  const [diagnostico, setDiagnostico] = useState(borrador?.diagnostico ?? "");
  const parsedMeds = parsearMedicamentosBorrador(borrador);
  const [medicamentos, setMedicamentos] = useState<MedicamentoReceta[]>(parsedMeds.meds);
  const [recetaTextoLibre, setRecetaTextoLibre] = useState(parsedMeds.textoLibre);
  const receta = serializarMedicamentos(medicamentos, recetaTextoLibre);
  const [indicaciones, setIndicaciones] = useState(borrador?.indicaciones ?? "");
  // Certificado de reposo laboral (art. 210 LCT). `certificado` = texto del
  // tratamiento indicado en el certificado; `diasReposo` = dato jurídico numérico
  // (días de reposo desde la emisión). El reposo arranca el día de emisión (día 1)
  // y se extiende por la cantidad de días — el inicio NO es editable (decisión Diego).
  const [certificado, setCertificado] = useState(borrador?.certificado ?? "");
  const [diasReposo, setDiasReposo] = useState<string>(
    borrador?.dias_reposo != null ? String(borrador.dias_reposo) : ""
  );
  const [diasError, setDiasError] = useState(false);
  const diasReposoNum = parseInt(diasReposo, 10);
  const diasReposoValido = Number.isInteger(diasReposoNum) && diasReposoNum >= 1;
  // ¿El valor actual coincide con un chip rápido? (horas 24/48/72 → 1/2/3 días, o
  // días 4/5/6). Si no, vive en el input "Otro".
  const diasReposoEsChip =
    [...HORAS_REPOSO_RAPIDAS.map((h) => h / 24), ...DIAS_REPOSO_RAPIDOS].includes(diasReposoNum);
  // ¿El médico está emitiendo un certificado de reposo? (texto o días cargados)
  const emitiendoCertificado = certificado.trim().length > 0 || diasReposo.trim().length > 0;
  // Orden médica (RX, laboratorio, derivaciones). Es texto plano y se persiste
  // como documento tipo "orden". NO entra en la evolución ni en la HC.
  const [orden, setOrden] = useState(borrador?.orden ?? "");
  // --- Evolución: generación MANUAL y obligatoria (no auto-pre-llenado) ---
  // El médico aprieta "Generar evolución" → componemos con el estado ACTUAL de
  // todos los campos. Generar ES la validación humana; no hay paso aparte.
  const [evolucion, setEvolucion] = useState(borrador?.evolucion ?? "");
  // evolucionGenerada (boolean): ¿se generó ya? Es el gate. Se restaura como true
  // si venía evolución del borrador (el médico ya generó en una sesión anterior).
  const [evolucionGenerada, setEvolucionGenerada] = useState<boolean>(
    (borrador?.evolucion ?? "").trim().length > 0
  );
  // evolucionBase = texto exacto del último componer(). Sirve para detectar si el
  // médico editó el texto a mano (evolucion_editada). Al restaurar del borrador no
  // conocemos el base original; usamos el texto guardado (editada arranca en false).
  const [evolucionBase, setEvolucionBase] = useState<string>(borrador?.evolucion ?? "");
  // Momento de la generación (revisión humana). Se persiste como evolucion_validada_at.
  const [evolucionValidadaAt, setEvolucionValidadaAt] = useState<string | null>(null);

  // --- UI state ---
  const [finalizando, setFinalizando] = useState(false);
  const [iframeVisible, setIframeVisible] = useState(true);
  // finalizandoRef: flag síncrono para distinguir, en onDisconnected, una
  // finalización iniciada por el médico (NO mostrar rejoin) de un corte accidental.
  // Se setea ANTES de borrar la sala en finalizarConsulta(). [protección anti-#169]
  const finalizandoRef = useRef(false);
  // rejoin (Fase 1): overlay "Se cortó la llamada / Retomar / Finalizar" cuando
  // el corte NO fue una finalización del médico. El reloj real (2 min) vive en el
  // servidor (desconectado_at + cron); acá solo mostramos UI.
  const [mostrandoRejoin, setMostrandoRejoin] = useState(false);
  const [reconectandoRejoin, setReconectandoRejoin] = useState(false);
  const reconectandoRef = useRef(false);
  // tokenActivo / roomKey: para remontar el <LiveKitRoom> con token fresco al retomar.
  const [tokenActivo, setTokenActivo] = useState<string | null>(livekitToken);
  const [roomKey, setRoomKey] = useState(0);
  const [error, setError] = useState<string | null>(videoErrorProp);
  const [timerSeg, setTimerSeg] = useState(0);
  const [guardadoManual, setGuardadoManual] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showSalirDialog, setShowSalirDialog] = useState(false);
  const [showFaltaDialog, setShowFaltaDialog] = useState(false);
  const [showModalCobertura, setShowModalCobertura] = useState<"completar" | "editar" | null>(null);
  const [coberturaLocal, setCoberturaLocal] = useState<DatosCobertura>(consulta.paciente_cobertura);

  // Mobile: tres modos explícitos.
  const [modo, setModo] = useState<ModoWorkspace>("video");
  const modoEscritura = modo !== "video";
  // Desktop: colapsar panel documentación
  const [panelColapsado, setPanelColapsado] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("docto_panel_colapsado") === "true";
    }
    return false;
  });
  function togglePanel() {
    setPanelColapsado((prev) => {
      const next = !prev;
      localStorage.setItem("docto_panel_colapsado", String(next));
      return next;
    });
  }
  const [diagError, setDiagError] = useState(false);
  const diagRef = useRef<HTMLTextAreaElement>(null);
  // Ref al bloque de días de reposo, para centrarlo en viewport cuando el guard
  // del certificado falla (el acordeón se abre solo vía forceOpen + scroll acá).
  const diasBlockRef = useRef<HTMLDivElement>(null);
  // Refs/flags de la tarjeta de evolución
  const tarjetaEvolucionRef = useRef<HTMLDivElement>(null);
  const generarBtnRef = useRef<HTMLButtonElement>(null);
  const [pulseGenerar, setPulseGenerar] = useState(false);
  // Snapshot de los campos FUENTE (diagnóstico/indicaciones/receta/certificado)
  // en el momento de generar. Si después cambia alguno, la evolución quedó stale
  // y volvemos al estado inicial. NO incluye el texto de la evolución (editar el
  // textarea es edición del médico, se preserva — no resetea). Se inicializa con
  // las fuentes del mount si la evolución venía generada del borrador, para que un
  // cambio posterior de fuente la invalide igual.
  const fuentesSnapshotRef = useRef<string | null>(null);
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "";

  // --- Auto-save ---
  // evolucion_editada se persiste DERIVADO en el borrador (no la validación: se
  // rehace si recargás). Se computa inline, no desde el state, para no depender
  // del orden de actualización.
  const { estado: estadoBorrador } = useAutoSaveBorrador(consultaId, tipo, {
    diagnostico,
    receta,
    indicaciones,
    certificado,
    dias_reposo: diasReposoValido ? diasReposoNum : null,
    orden,
    evolucion,
    evolucion_editada: evolucion.trim() !== evolucionBase.trim(),
    medicamentos_structured: medicamentos,
    receta_texto_libre: recetaTextoLibre,
  });

  // --- Dictado ---
  const { dictando, iniciar: iniciarDictado, detener: detenerDictado, soportado: dictadoSoportado } = useDictado();

  // --- Hint auriculares (solo la primera vez que se activa dictado) ---
  const [showHintAuriculares, setShowHintAuriculares] = useState(false);
  const hintMostradoRef = useRef(false);

  useEffect(() => {
    if (dictando === null) return;
    if (hintMostradoRef.current) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem("dictado_hint_visto")) return;

    hintMostradoRef.current = true;
    setShowHintAuriculares(true);
    localStorage.setItem("dictado_hint_visto", "1");

    const timer = setTimeout(() => setShowHintAuriculares(false), 6000);
    return () => clearTimeout(timer);
  }, [dictando]);

  // --- Estudios count ---
  const estudiosCount = useEstudiosCount(consultaId);

  // --- Datos derivados ---
  const edad = calcularEdad(consulta.paciente_nacimiento);

  // --- Evolución: armado de datos para el motor de composición ---
  // Mapea el estado del workspace → DatosEvolucion. Pura, sin efectos.
  const construirDatosEvolucion = useCallback((): DatosEvolucion => {
    const sexoRaw = consulta.paciente_sexo_dni;
    const sexo: DatosEvolucion["sexo"] =
      sexoRaw === "masculino" || sexoRaw === "femenino" ? sexoRaw : null;
    return {
      edad: calcularEdadNumero(consulta.paciente_nacimiento),
      sexo,
      motivo: consulta.motivo_consulta,
      sintomas: consulta.sintomas,
      plazo: consulta.tiempo_sintomas,
      diagnostico,
      indicaciones,
      receta, // ya serializada; el motor strip-ea "Rp/"
      certificado,
      // Sin campo "comentario" separado: el médico edita/agrega libre directo en
      // el textarea de la evolución tras generar. El motor lo deja en null.
      comentario: null,
    };
  }, [
    consulta.paciente_sexo_dni,
    consulta.paciente_nacimiento,
    consulta.motivo_consulta,
    consulta.sintomas,
    consulta.tiempo_sintomas,
    diagnostico,
    indicaciones,
    receta,
    certificado,
  ]);

  // --- Firma de los campos FUENTE de la evolución ---
  // Identidad de lo que alimenta el componer(). Si cambia tras generar, la
  // evolución quedó stale. NO incluye el texto de la evolución: editar el textarea
  // es edición del médico y se preserva.
  const fuentesEvolucion = JSON.stringify([
    diagnostico.trim(),
    indicaciones.trim(),
    receta.trim(),
    certificado.trim(),
  ]);

  // --- Generar / Regenerar evolución (acción humana explícita) ---
  // Compone con el estado ACTUAL de todos los campos, puebla el textarea, guarda
  // el texto base (para detectar ediciones) y el snapshot de fuentes (para detectar
  // staleness). Marca la evolución como generada → satisface el gate de finalizar.
  function generarEvolucion() {
    const texto = componerEvolucion(construirDatosEvolucion());
    setEvolucion(texto);
    setEvolucionBase(texto);
    setEvolucionGenerada(true);
    setEvolucionValidadaAt(new Date().toISOString());
    fuentesSnapshotRef.current = fuentesEvolucion;
    setPulseGenerar(false);
    setError(null);
  }

  // --- Reset por staleness: si cambian los campos fuente DESPUÉS de generar,
  //     volvemos al estado inicial (textarea limpio, botón "Generar" de nuevo).
  //     Editar el TEXTO de la evolución no dispara esto (no toca las fuentes).
  useEffect(() => {
    if (!evolucionGenerada) return;
    // Primer pase con evolución restaurada del borrador: anclar el snapshot a las
    // fuentes actuales (que es lo que reflejaba la evolución guardada). NO invalidar.
    if (fuentesSnapshotRef.current === null) {
      fuentesSnapshotRef.current = fuentesEvolucion;
      return;
    }
    if (fuentesEvolucion === fuentesSnapshotRef.current) return;
    // Una fuente cambió → invalidar y volver al estado inicial.
    setEvolucionGenerada(false);
    setEvolucion("");
    setEvolucionBase("");
    setEvolucionValidadaAt(null);
    fuentesSnapshotRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuentesEvolucion]);

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

  // --- Gate amable: estado de campos obligatorios ---
  const faltaDiagnostico = !diagnostico.trim();
  // El chip "Evolución" se prende cuando la evolución fue generada (acción humana
  // explícita). Generar ES la validación; no hay paso aparte.
  const faltaEvolucion = !evolucionGenerada;
  const faltanObligatorios = faltaDiagnostico || faltaEvolucion;

  // Helper: llevar la vista a la tarjeta de evolución y hacer pulse en "Generar
  // evolución" durante 600ms. La acción que falta es generar.
  function resaltarGenerarEvolucion() {
    setModo("escritura");
    setTimeout(() => {
      tarjetaEvolucionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setPulseGenerar(true);
      setTimeout(() => setPulseGenerar(false), 600);
    }, 350);
  }

  // Helper: mostrar el error del certificado de reposo (días faltantes). Abre el
  // acordeón (forceOpen={diasError}), pasa a modo escritura y centra el bloque de
  // días en viewport tras el render (espeja el patrón de resaltarGenerarEvolucion).
  function mostrarErrorDiasReposo() {
    setError("El certificado de reposo requiere elegir las horas o los días de reposo.");
    setDiasError(true);
    setModo("escritura");
    setTimeout(() => {
      diasBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350);
  }

  // Helper: validar campos obligatorios antes de finalizar
  function validarCamposObligatorios(): boolean {
    if (!diagnostico.trim()) {
      setError("Completá el diagnóstico antes de finalizar la consulta.");
      setDiagError(true);
      setModo("escritura");
      setTimeout(() => diagRef.current?.focus(), 350);
      return false;
    }
    if (!evolucionGenerada) {
      setError("Generá la evolución antes de finalizar.");
      resaltarGenerarEvolucion();
      return false;
    }
    // Guard del certificado de reposo: si el médico lo está emitiendo (escribió
    // tratamiento o cargó días), los días de reposo son un dato jurídico obligatorio
    // y deben ser un entero >= 1 (art. 210 LCT). No se puede emitir un reposo de 0 días.
    if (emitiendoCertificado && !diasReposoValido) {
      mostrarErrorDiasReposo();
      return false;
    }
    return true;
  }

  // --- Punto de entrada único de finalización desde el video ---
  // Si faltan obligatorios → dialog amable. Si no → dialog de confirmación actual.
  function intentarFinalizar() {
    if (faltanObligatorios) {
      setShowFaltaDialog(true);
      return;
    }
    // Certificado de reposo: si se está emitiendo, los días son obligatorios (>=1).
    // Se atrapa acá, antes del dialog de confirmación, para que el error sea visible.
    if (emitiendoCertificado && !diasReposoValido) {
      mostrarErrorDiasReposo();
      return;
    }
    setShowConfirmDialog(true);
  }

  // --- Desde el dialog "Falta completar": ir a documentar y enfocar el campo faltante ---
  function completarAhora() {
    setShowFaltaDialog(false);
    if (faltaDiagnostico) {
      setModo("escritura");
      setDiagError(true);
      setTimeout(() => diagRef.current?.focus(), 350);
    } else if (faltaEvolucion) {
      resaltarGenerarEvolucion();
    }
  }

  // --- Iniciar finalización — verifica cobertura si hay receta ---
  function iniciarFinalizacion() {
    if (!validarCamposObligatorios()) return;

    // Si hay receta y cobertura incompleta → modal automático
    if (receta.trim() && !datosCoberturaCompletos(coberturaLocal)) {
      setShowConfirmDialog(false);
      setShowModalCobertura("completar");
      return;
    }

    // Cobertura OK o no hay receta → finalizar directo
    setShowConfirmDialog(false);
    finalizarConsulta();
  }

  // --- Callback del modal de cobertura ---
  async function handleCoberturaConfirmada(datos: DatosCobertura) {
    setCoberturaLocal(datos);
    setShowModalCobertura(null);

    // Guardar en pacientes (fire-and-forget)
    const supabase = createClient();
    const pacienteId = await resolverPacienteId(supabase, consulta.paciente_id);

    if (pacienteId) {
      supabase
        .from("pacientes")
        .update({
          tiene_cobertura: datos.tiene_cobertura,
          obra_social: datos.obra_social,
          nro_afiliado: datos.nro_afiliado,
          plan_obra_social: datos.plan_obra_social,
        })
        .eq("id", pacienteId)
        .then(() => {});
    }

    finalizarConsulta();
  }

  // --- Finalizar consulta ---
  async function finalizarConsulta() {
    if (!validarCamposObligatorios()) return;

    const sinCuil = receta.trim() && !consulta.paciente_cuil;

    setFinalizando(true);
    // Marcar finalización iniciada por el médico ANTES de borrar la sala, para
    // que onDisconnected (que se dispara al destruirse el room) NO muestre el
    // overlay de rejoin. [protección anti-#169]
    finalizandoRef.current = true;

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
    router.push(sinCuil ? "/dashboard?aviso=sin-cuil&from=videollamada" : "/dashboard?from=videollamada");

    // 4. Guardar documentos y cerrar consulta/turno en background (fire-and-forget)
    //    Mismo flujo para ambos canales; solo cambian tabla, estado y FK del paciente.
    (async () => {
      try {
        const supabase = createClient();

        const { data: registroDb } = await supabase
          .from(tablaPrincipal)
          .select("estado, paciente_id, medico_id")
          .eq("id", consultaId)
          .single();

        if (!registroDb?.paciente_id) return;
        if (registroDb.estado === estadoCompletado) return;

        // pacientes.id para el insert de documentos (asimetría de schema por canal):
        // - consulta: paciente_id es auth.users.id → lookup por user_id
        // - turno: paciente_id YA es pacientes.id → directo
        const pacienteId = await resolverPacienteId(supabase, registroDb.paciente_id);

        const { data: medico } = await supabase
          .from("medicos")
          .select("id")
          .eq("id", registroDb.medico_id)
          .single();

        if (!pacienteId || !medico) return;

        const docs: {
          tipo: string;
          contenido: string;
          tratamiento?: string | null;
          dias_reposo?: number | null;
        }[] = [];
        if (receta.trim() && !sinCuil) docs.push({ tipo: "receta", contenido: receta.trim() });
        if (indicaciones.trim())
          docs.push({ tipo: "indicaciones", contenido: indicaciones.trim() });
        // Certificado de reposo (art. 210 LCT): se emite si hay tratamiento o días.
        // El PDF arma TRATAMIENTO INDICADO desde `tratamiento` (prefill: el cuerpo
        // del certificado, o las indicaciones como fallback) y REPOSO LABORAL desde
        // `dias_reposo`. El rango se calcula desde `created_at` (día de emisión).
        if (certificado.trim() || diasReposoValido)
          docs.push({
            tipo: "certificado",
            contenido: certificado.trim(),
            tratamiento: certificado.trim() || indicaciones.trim() || null,
            dias_reposo: diasReposoValido ? diasReposoNum : null,
          });
        if (orden.trim())
          docs.push({ tipo: "orden", contenido: orden.trim() });
        if (docs.length === 0)
          docs.push({ tipo: "indicaciones", contenido: diagnostico.trim() });

        await supabase.from("documentos").insert(
          docs.map((d) => ({
            consulta_id: esTurno ? null : consultaId,
            turno_id: esTurno ? consultaId : null,
            paciente_id: pacienteId,
            medico_id: medico.id,
            tipo: d.tipo,
            diagnostico: diagnostico.trim(),
            contenido: d.contenido,
            tratamiento: d.tratamiento ?? null,
            dias_reposo: d.dias_reposo ?? null,
          }))
        );

        await supabase
          .from(tablaPrincipal)
          .update({
            estado: estadoCompletado,
            doc_borrador: null,
            evolucion: evolucion.trim(),
            // Momento de generar; fallback al de finalizar si por algún borde no se
            // capturó (evolución restaurada del borrador sin regenerar en esta sesión).
            evolucion_validada_at: evolucionValidadaAt ?? new Date().toISOString(),
            evolucion_editada: evolucion.trim() !== evolucionBase.trim(),
          })
          .eq("id", consultaId);

        // Borrar estudios temporales del paciente (route channel-aware)
        fetch("/api/consulta/borrar-estudios-temp", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ consultaId, tipo }),
        }).catch(() => {});

        fetch("/api/push/notificar-documentos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ pacienteId, consultaId, tipo }),
        }).catch(() => {});
      } catch {
        // Background: no hay UI para mostrar error, falla silenciosamente
      }
    })();
  }

  // --- LiveKit: desconexión detectada (médico) ---
  // Si la desconexión es una finalización iniciada por el médico (finalizandoRef)
  // o una reconexión intencional (reconectandoRef), NO mostramos rejoin: solo
  // ocultamos el video como antes. Si es un corte accidental → overlay de rejoin.
  function handleDisconnected() {
    setIframeVisible(false);
    if (finalizandoRef.current || reconectandoRef.current) return;
    setMostrandoRejoin(true);
  }

  // --- Retomar llamada (médico) ---
  // Pide un token fresco al mismo room (vivo por emptyTimeout) y remonta el
  // <LiveKitRoom>. El webhook participant_joined limpiará desconectado_at.
  async function retomarLlamada() {
    setReconectandoRejoin(true);
    reconectandoRef.current = true;
    try {
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId, tipo }),
      });
      if (!res.ok) {
        // 409 = consulta ya finalizó → no reconectar, cerrar overlay.
        setMostrandoRejoin(false);
        return;
      }
      const data = await res.json();
      setTokenActivo(data.token);
      setMostrandoRejoin(false);
      setIframeVisible(true);
      setRoomKey((k) => k + 1); // remount → reconecta
    } catch {
      // Falla de red: dejamos el overlay para reintentar.
    } finally {
      setReconectandoRejoin(false);
      // Liberar el flag de reconexión tras el remount.
      setTimeout(() => { reconectandoRef.current = false; }, 1500);
    }
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
          tipo,
          borrador: {
            diagnostico,
            receta,
            indicaciones,
            certificado,
            dias_reposo: diasReposoValido ? diasReposoNum : null,
            orden,
            evolucion,
            medicamentos_structured: medicamentos,
            receta_texto_libre: recetaTextoLibre,
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
            ? "h-[52px] min-h-[52px]"
            : "h-[75dvh] min-h-[200px]"
        } md:h-auto md:min-h-0 ${panelColapsado ? "md:w-full" : "md:w-[60%] md:flex-1"} transition-all duration-300 ease-in-out`}
      >
        {/* Barra compacta modo escritura (solo mobile) */}
        <div
          className={`flex items-center justify-between px-4 ${
            modoEscritura ? "py-1" : "py-3"
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
                onClick={() => setModo("video")}
                className="md:hidden rounded-lg px-2.5 py-1 text-xs font-medium text-white bg-white/10 hover:bg-white/20 transition min-h-[36px]"
              >
                Video
              </button>
            )}
            {/* Botón colapsar/expandir panel (solo desktop) */}
            <button
              type="button"
              onClick={togglePanel}
              className="hidden md:flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition"
              style={{ minHeight: "36px" }}
              title={panelColapsado ? "Mostrar panel" : "Expandir video"}
            >
              {panelColapsado ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
              )}
            </button>
            {/* Botón salir — siempre visible. Mobile en modoEscritura: 36px alto. Resto: 44px */}
            <button
              type="button"
              onClick={() => setShowSalirDialog(true)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition ${modoEscritura ? "min-h-[36px] md:min-h-[44px]" : "min-h-[44px]"}`}
              style={{ minWidth: "44px" }}
            >
              Salir
            </button>
          </div>
        </div>

        {/* Video + footer — todo dentro de LiveKitRoom para que los hooks funcionen */}
        {tokenActivo && roomName && livekitUrl ? (
          <div className="flex flex-1 flex-col min-h-0" style={{ display: iframeVisible ? "flex" : "none" }}>
            <LiveKitRoom
              key={roomKey}
              serverUrl={livekitUrl}
              token={tokenActivo}
              connect={true}
              audio={false}
              video={false}
              onDisconnected={handleDisconnected}
              style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
            >
              <RoomAudioRenderer />
              <DictadoSignaler dictando={dictando} />

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
                        {/* Fila 2: Barra de modos — Documentar / Estudios / HC */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setModo("escritura")}
                            className="flex-[1.3] rounded-xl bg-[#378ADD] py-3 text-sm font-medium text-white active:scale-95 transition-all duration-100"
                            style={{ minHeight: "48px" }}
                          >
                            Documentar
                          </button>
                          <button
                            type="button"
                            onClick={() => setModo("estudios")}
                            className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-medium text-white active:scale-95 transition-all duration-100 relative"
                            style={{ minHeight: "48px" }}
                          >
                            Estudios
                            {estudiosCount > 0 && (
                              <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#D85A30] px-1.5 text-[10px] font-bold text-white">
                                {estudiosCount}
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setModo("hc")}
                            className="flex-[0.7] rounded-xl bg-white/10 py-3 text-sm font-medium text-white active:scale-95 transition-all duration-100"
                            style={{ minHeight: "48px" }}
                          >
                            HC
                          </button>
                        </div>
                        {/* Fila 3: chips de estado + Finalizar full width */}
                        <ChipsEstadoObligatorios faltaDiagnostico={faltaDiagnostico} faltaEvolucion={faltaEvolucion} />
                        <LoadingButton
                          type="button"
                          isLoading={finalizando}
                          onClick={intentarFinalizar}
                          className="w-full rounded-xl py-3 text-sm font-medium text-white transition-all duration-100 active:scale-95 disabled:opacity-50"
                          style={{ backgroundColor: "#378ADD", minHeight: "48px" }}
                        >
                          Finalizar y enviar al paciente
                        </LoadingButton>
                      </div>
                    )}

                    {/* DESKTOP footer: mic/cam + timer + chips + finalizar */}
                    <div
                      className="hidden md:flex flex-col gap-2 px-4 py-2"
                      style={{ borderTop: "0.5px solid rgba(255,255,255,0.1)" }}
                    >
                      <div className="flex items-center justify-center gap-3">
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
                      <ChipsEstadoObligatorios faltaDiagnostico={faltaDiagnostico} faltaEvolucion={faltaEvolucion} />
                      <LoadingButton
                        type="button"
                        isLoading={finalizando}
                        onClick={intentarFinalizar}
                        className="w-full rounded-xl py-2.5 text-sm font-medium text-white transition-all duration-100 hover:bg-[#2e6fb5] active:scale-95 disabled:opacity-50"
                        style={{ backgroundColor: "#378ADD", minHeight: "44px" }}
                      >
                        Finalizar y enviar al paciente
                      </LoadingButton>
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
        className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${
          panelColapsado ? "md:hidden" : "md:w-[40%] md:flex-none"
        } ${modoEscritura ? "" : "hidden md:block"}`}
        style={{ borderLeft: "0.5px solid #e5e7eb" }}
      >
        {/* Desktop: Barra de modos — Documentación / Estudios / HC */}
        <div
          className="hidden md:flex items-center gap-1 px-4 py-2"
          style={{ borderBottom: "0.5px solid #e5e7eb" }}
        >
          <button
            type="button"
            onClick={() => setModo(modo === "video" ? "video" : "escritura")}
            className={`rounded-lg px-4 py-2 text-xs font-medium transition ${
              modo === "estudios" || modo === "hc"
                ? "text-gray-500 hover:bg-gray-100"
                : "bg-[#378ADD] text-white"
            }`}
          >
            Documentación
          </button>
          <button
            type="button"
            onClick={() => setModo("estudios")}
            className={`rounded-lg px-4 py-2 text-xs font-medium transition relative ${
              modo === "estudios"
                ? "bg-[#378ADD] text-white"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            Estudios
            {estudiosCount > 0 && modo !== "estudios" && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D85A30] px-1 text-[10px] font-bold text-white">
                {estudiosCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setModo("hc")}
            className={`rounded-lg px-4 py-2 text-xs font-medium transition ${
              modo === "hc"
                ? "bg-[#378ADD] text-white"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            HC
          </button>
        </div>

        {/* Contenido: Estudios / Historia Clínica / Documentación */}
        {modo === "estudios" ? (
          <PanelEstudios
            consultaId={consultaId}
            estadoConsulta="en_curso"
            createdAt={horaInicio}
          />
        ) : modo === "hc" ? (
          <PanelHistoriaClinica entradas={evolucionesPrevias} />
        ) : (
        <div className="p-5">
          {/* Info paciente (solo desktop) */}
          <div className="hidden md:block">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium tracking-wide text-gray-400">
                PACIENTE
              </p>
              {/* \u00cdcono l\u00e1piz \u2014 editar cobertura manualmente */}
              <button
                type="button"
                onClick={() => setShowModalCobertura("editar")}
                className="rounded-md p-3 text-gray-400 hover:text-[#378ADD] hover:bg-blue-50 transition"
                style={{ minHeight: "44px", minWidth: "44px" }}
                title="Editar cobertura"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  <path d="m15 5 4 4" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-lg font-medium text-gray-900">
              {consulta.paciente_nombre}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              {[edad, consulta.especialidad].filter(Boolean).join(" \u00b7 ")}
            </p>

            {/* Cobertura resumida */}
            <p className="mt-1 text-xs text-gray-400">
              {coberturaLocal.tiene_cobertura === false && "Particular"}
              {coberturaLocal.tiene_cobertura === true && coberturaLocal.obra_social && coberturaLocal.obra_social}
              {coberturaLocal.tiene_cobertura === null && "Cobertura sin completar"}
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
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">
                {consulta.paciente_nombre}
              </p>
              <button
                type="button"
                onClick={() => setShowModalCobertura("editar")}
                className="rounded-md p-3 text-gray-400 hover:text-[#378ADD] hover:bg-blue-50 transition"
                style={{ minHeight: "44px", minWidth: "44px" }}
                title="Editar cobertura"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  <path d="m15 5 4 4" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-500">
              {[edad, consulta.especialidad].filter(Boolean).join(" \u00b7 ")}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              {coberturaLocal.tiene_cobertura === false && "Particular"}
              {coberturaLocal.tiene_cobertura === true && coberturaLocal.obra_social && coberturaLocal.obra_social}
              {coberturaLocal.tiene_cobertura === null && "Cobertura sin completar"}
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

          {/* Banner DICTADO EN CURSO — indica campo activo */}
          {dictando !== null && (
            <div
              className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ backgroundColor: "#D85A3015", border: "1px solid #D85A30" }}
            >
              <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: "#D85A30" }} />
              <span className="text-xs font-medium" style={{ color: "#D85A30" }}>
                DICTADO EN CURSO — {
                  dictando === "diagnostico" ? "Diagnóstico" :
                  dictando === "evolucion" ? "Evolución" :
                  dictando === "indicaciones" ? "Indicaciones" :
                  dictando === "certificado" ? "Certificado" :
                  dictando === "orden" ? "Orden médica" :
                  dictando === "receta" ? "Receta" : dictando
                }
              </span>
            </div>
          )}

          {/* Hint auriculares — toast flotante para no empujar contenido */}
          {showHintAuriculares && (
            <div
              className="fixed bottom-24 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50 flex items-start gap-2 rounded-xl px-4 py-3 shadow-lg"
              style={{ backgroundColor: "#378ADD", color: "white" }}
            >
              <span className="text-sm mt-0.5">🎧</span>
              <p className="text-xs text-white">
                Para mejor calidad de dictado, usá auriculares. El paciente ve un aviso mientras dictás.
              </p>
              <button
                type="button"
                onClick={() => setShowHintAuriculares(false)}
                className="ml-auto shrink-0 text-xs text-white/60 hover:text-white"
                style={{ minHeight: "24px", minWidth: "24px" }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Campos — orden: Diagnóstico (plano) → Indicaciones → Receta →
              Certificado → Orden → Evolución (tarjeta, ÚLTIMA). Diagnóstico
              siempre visible; los del medio en acordeón (densidad mobile). */}
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
            soportado={dictadoSoportado}
          />

          {/* Acordeón: INDICACIONES */}
          <AccordionSection title="INDICACIONES" hasContent={indicaciones.trim().length > 0}>
            <CampoDictado
              label=""
              campo="indicaciones"
              value={indicaciones}
              setter={setIndicaciones}
              placeholder="Reposo, estudios, derivaciones..."
              dictando={dictando}
              onIniciar={() => iniciarDictado("indicaciones", setIndicaciones)}
              onDetener={detenerDictado}
              soportado={dictadoSoportado}
            />
          </AccordionSection>

          {/* Acordeón: RECETA */}
          <AccordionSection title="RECETA" hasContent={medicamentos.length > 0 || recetaTextoLibre.trim().length > 0}>
            <MedicamentoAutocomplete
              medicamentos={medicamentos}
              onMedicamentosChange={setMedicamentos}
              textoLibre={recetaTextoLibre}
              onTextoLibreChange={setRecetaTextoLibre}
              dictando={dictando}
              onIniciarDictado={() => iniciarDictado("receta", setRecetaTextoLibre)}
              onDetenerDictado={detenerDictado}
            />
          </AccordionSection>

          {/* Acordeón: CERTIFICADO DE REPOSO (art. 210 LCT) — días estructurados +
              tratamiento (prefill opcional desde indicaciones). El reposo arranca el
              día de emisión; el inicio no es editable. */}
          <AccordionSection
            title="CERTIFICADO DE REPOSO"
            hasContent={emitiendoCertificado}
            forceOpen={diasError}
          >
            {/* Reposo laboral — dato jurídico obligatorio (sin default). Dos grupos:
                horas para el reposo corto (24/48/72 hs → 1/2/3 días) y días para el
                largo (4/5/6 + "Otro"). Se persiste siempre como dias_reposo. */}
            <div className="mb-3" ref={diasBlockRef}>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Reposo laboral <span className="text-gray-400">(desde hoy)</span>
              </label>

              <span className="mt-1 mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Horas</span>
              <div className="flex flex-wrap items-center gap-2">
                {HORAS_REPOSO_RAPIDAS.map((h) => {
                  const d = h / 24;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => { setDiasReposo(String(d)); setDiasError(false); }}
                      className={`min-h-[44px] rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                        diasReposoNum === d
                          ? "border-[#378ADD] bg-[#378ADD] text-white"
                          : "border-gray-300 bg-white text-gray-700"
                      }`}
                    >
                      {h} hs
                    </button>
                  );
                })}
              </div>

              <span className="mt-4 mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Días</span>
              <div className="flex flex-wrap items-center gap-2">
                {DIAS_REPOSO_RAPIDOS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => { setDiasReposo(String(d)); setDiasError(false); }}
                    className={`min-h-[44px] rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      diasReposoNum === d
                        ? "border-[#378ADD] bg-[#378ADD] text-white"
                        : "border-gray-300 bg-white text-gray-700"
                    }`}
                  >
                    {d} días
                  </button>
                ))}
                <input
                  type="text"
                  inputMode="numeric"
                  value={diasReposoEsChip ? "" : diasReposo}
                  onChange={(e) => {
                    setDiasReposo(e.target.value.replace(/[^\d]/g, ""));
                    setDiasError(false);
                  }}
                  placeholder="Otro"
                  aria-label="Otra cantidad de días de reposo"
                  className={`min-h-[44px] w-24 rounded-lg border px-3 py-2 text-sm ${
                    diasError ? "border-[#E24B4A]" : "border-gray-300"
                  }`}
                />
              </div>
              {diasError && (
                <p className="mt-2 text-xs text-[#E24B4A]">
                  Elegí las horas o los días de reposo para emitir el certificado.
                </p>
              )}
            </div>

            {/* Tratamiento indicado — prefill opcional desde Indicaciones */}
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Tratamiento indicado</label>
              {indicaciones.trim().length > 0 && certificado.trim().length === 0 && (
                <button
                  type="button"
                  onClick={() => setCertificado(indicaciones)}
                  className="-mr-2 px-2 py-1 text-xs font-medium text-[#378ADD]"
                >
                  Usar indicaciones
                </button>
              )}
            </div>
            <CampoDictado
              label=""
              campo="certificado"
              value={certificado}
              setter={setCertificado}
              placeholder="Reposo, medicación, recomendaciones..."
              dictando={dictando}
              onIniciar={() => iniciarDictado("certificado", setCertificado)}
              onDetener={detenerDictado}
              soportado={dictadoSoportado}
            />
          </AccordionSection>

          {/* Acordeón: ORDEN MÉDICA — texto plano, persiste como documento tipo
              "orden". NO entra en la evolución ni en la HC. */}
          <AccordionSection title="ORDEN MÉDICA" hasContent={orden.trim().length > 0}>
            <CampoDictado
              label=""
              campo="orden"
              value={orden}
              setter={setOrden}
              placeholder="RX de codo, laboratorio, derivaciones..."
              dictando={dictando}
              onIniciar={() => iniciarDictado("orden", setOrden)}
              onDetener={detenerDictado}
              soportado={dictadoSoportado}
            />
          </AccordionSection>

          {/* Evolución — TarjetaEvolucion, plana y ÚLTIMA. El ref + scrollIntoView
              de resaltarGenerarEvolucion() siguen funcionando con la tarjeta acá. */}
          <TarjetaEvolucion
            ref={tarjetaEvolucionRef}
            generarBtnRef={generarBtnRef}
            evolucionGenerada={evolucionGenerada}
            evolucion={evolucion}
            onEvolucionChange={(v) => { setEvolucion(v); setError(null); }}
            onGenerar={generarEvolucion}
            onRegenerar={generarEvolucion}
            pulseGenerar={pulseGenerar}
          />

          {/* Acciones sticky — la documentación solo guarda (auto-save) y vuelve a la llamada. */}
          {/* "Finalizar" vive SOLO en el footer de video (presencia). */}
          <div
            className="sticky bottom-0 mt-6 bg-[#f8f9fa] pb-5 pt-3"
            style={{ borderTop: "0.5px solid #e5e7eb" }}
          >
            {/* Mobile modo escritura: Volver a la llamada (auto-save cubre guardado) */}
            <div className="md:hidden flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setModo("video")}
                className="w-full rounded-xl px-6 py-3.5 text-sm font-medium text-white transition-all duration-100 active:scale-95 active:opacity-80"
                style={{ backgroundColor: "#378ADD", minHeight: "48px" }}
              >
                Volver a la llamada
              </button>
            </div>

            {/* Desktop: cancelar consulta (finalizar vive en el footer de video) */}
            <div className="hidden md:flex md:flex-col md:gap-2">
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
        )}
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
              Se van a enviar los documentos al paciente. ¿Confirmás?
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
                  iniciarFinalizacion();
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#378ADD",
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

      {/* Overlay de rejoin (Fase 1) — la llamada se cortó (no por finalización) */}
      {mostrandoRejoin && (
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
          <div style={{ background: "white", borderRadius: "16px", padding: "24px", maxWidth: "360px", width: "100%" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#111", marginBottom: "8px" }}>
              Se cortó la llamada
            </h3>
            <p style={{ fontSize: "14px", color: "#666", marginBottom: "24px" }}>
              Se perdió la conexión con el paciente. Podés retomar la llamada o finalizar la consulta.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <button
                onClick={retomarLlamada}
                disabled={reconectandoRejoin}
                style={{
                  padding: "12px",
                  borderRadius: "12px",
                  border: "none",
                  background: "#378ADD",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: reconectandoRejoin ? "default" : "pointer",
                  opacity: reconectandoRejoin ? 0.5 : 1,
                  minHeight: "44px",
                }}
              >
                {reconectandoRejoin ? "Reconectando…" : "Retomar llamada"}
              </button>
              <button
                onClick={() => { setMostrandoRejoin(false); intentarFinalizar(); }}
                style={{
                  padding: "12px",
                  borderRadius: "12px",
                  border: "1px solid #d1d5db",
                  background: "white",
                  color: "#374151",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  minHeight: "44px",
                }}
              >
                {faltanObligatorios ? "Finalizar y documentar" : "Finalizar consulta"}
              </button>
            </div>
            <p style={{ fontSize: "12px", color: "#888780", marginTop: "16px", textAlign: "center" }}>
              Si nadie vuelve en 2 minutos, la consulta se cierra automáticamente.
            </p>
          </div>
        </div>
      )}

      {/* Dialog "Falta completar" — gate amable antes de finalizar (NO botón deshabilitado) */}
      {showFaltaDialog && (
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
              Antes de finalizar
            </h3>
            <p
              style={{
                fontSize: "14px",
                color: "#666",
                marginBottom: "12px",
              }}
            >
              Para enviar los documentos al paciente, completá:
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px 0" }}>
              {faltaDiagnostico && (
                <li style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#111", marginBottom: "6px" }}>
                  <span style={{ display: "inline-block", height: "6px", width: "6px", borderRadius: "9999px", background: "#D85A30" }} />
                  Diagnóstico
                </li>
              )}
              {faltaEvolucion && (
                <li style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#111" }}>
                  <span style={{ display: "inline-block", height: "6px", width: "6px", borderRadius: "9999px", background: "#D85A30" }} />
                  Generá la evolución antes de finalizar.
                </li>
              )}
            </ul>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowFaltaDialog(false)}
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
                onClick={completarAhora}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#378ADD",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Completar ahora
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
              Vas a dejar la videollamada. Si todavía no finalizaste, podés volver más tarde a completar los documentos.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={() => {
                  setShowSalirDialog(false);
                  router.push("/dashboard?from=videollamada");
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

      {/* Modal datos cobertura paciente */}
      {showModalCobertura && (
        <ModalDatosPaciente
          modo={showModalCobertura}
          datos={coberturaLocal}
          pacienteNombre={consulta.paciente_nombre}
          onConfirmar={(datos) => {
            if (showModalCobertura === "completar") {
              handleCoberturaConfirmada(datos);
            } else {
              // Modo editar — guardar y cerrar, sin finalizar
              setCoberturaLocal(datos);
              setShowModalCobertura(null);
              const supabase = createClient();
              (async () => {
                const pacienteId = await resolverPacienteId(supabase, consulta.paciente_id);
                if (pacienteId) {
                  supabase
                    .from("pacientes")
                    .update({
                      tiene_cobertura: datos.tiene_cobertura,
                      obra_social: datos.obra_social,
                      nro_afiliado: datos.nro_afiliado,
                      plan_obra_social: datos.plan_obra_social,
                    })
                    .eq("id", pacienteId)
                    .then(() => {});
                }
              })();
            }
          }}
          onCancelar={() => setShowModalCobertura(null)}
        />
      )}
    </div>
  );
}
