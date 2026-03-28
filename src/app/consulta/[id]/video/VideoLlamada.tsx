"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

import { useEffect, useRef, useState, useCallback } from "react";
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
  tiempo_sintomas: string | null;
  paciente_nombre: string;
  paciente_nacimiento: string | null;
  paciente_cuil: string | null;
  medico_nombre: string;
  medico_domicilio: string | null;
};

type Props = {
  consultaId: string;
  esMedico: boolean;
  consulta: ConsultaData;
};

// --- Dictado por voz ---
function useDictado(
  frameRef: React.RefObject<ReturnType<typeof DailyIframe.createFrame> | null>,
  micOnRef: React.RefObject<boolean>
) {
  const recRef = useRef<any>(null);
  const [dictando, setDictando] = useState<string | null>(null);

  const iniciar = useCallback(
    (campo: string, setter: (fn: (prev: string) => string) => void) => {
      if (typeof window === "undefined") return;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;

      // Silenciar mic de la videollamada
      if (frameRef.current) frameRef.current.setLocalAudio(false);

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
      rec.onend = () => {
        setDictando(null);
        if (frameRef.current && micOnRef.current) frameRef.current.setLocalAudio(true);
      };

      recRef.current = rec;
      setDictando(campo);
      rec.start();
    },
    [frameRef, micOnRef]
  );

  const detener = useCallback(() => {
    if (recRef.current) {
      recRef.current.stop();
      recRef.current = null;
    }
    setDictando(null);
    if (frameRef.current && micOnRef.current) frameRef.current.setLocalAudio(true);
  }, [frameRef, micOnRef]);

  return { dictando, iniciar, detener };
}

function CampoDictado({
  label,
  campo,
  value,
  setter,
  placeholder,
  rows = 3,
  required = false,
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
  dictando: string | null;
  onIniciar: () => void;
  onDetener: () => void;
}) {
  const activo = dictando === campo;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-gray-400">
          {label}{required && " *"}
        </p>
        <button
          type="button"
          onMouseDown={onIniciar}
          onMouseUp={onDetener}
          onTouchStart={onIniciar}
          onTouchEnd={onDetener}
          className={`rounded-md px-2 py-1 text-xs transition ${
            activo ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          {activo ? "🔴 Dictando..." : "🎙️ Dictar"}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => setter(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="mt-1.5 w-full resize-none rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1D9E75]"
        style={{ border: "0.5px solid #e5e7eb" }}
      />
    </div>
  );
}

export default function VideoLlamada({ consultaId, esMedico, consulta }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [etapaCarga, setEtapaCarga] = useState("Preparando videollamada...");
  const [mobileUrl, setMobileUrl] = useState<string | null>(null);
  const [chromeIOS, setChromeIOS] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [finalizando, setFinalizando] = useState(false);
  const [pacienteSalio, setPacienteSalio] = useState(false);

  // Campos clínicos
  const [diagnostico, setDiagnostico] = useState("");
  const [receta, setReceta] = useState("");
  const [indicaciones, setIndicaciones] = useState("");
  const [certificado, setCertificado] = useState("");

  const frameRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null);
  const iniciadoRef = useRef(false);
  const unmountedRef = useRef(false);
  const joinedRef = useRef(false);
  const micOnRef = useRef(true);
  micOnRef.current = micOn;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dailyAbierto, setDailyAbierto] = useState(false);
  const nav = detectarNavegador();
  const edad = calcularEdad(consulta.paciente_nacimiento);
  const { dictando, iniciar: iniciarDictado, detener: detenerDictado } = useDictado(frameRef, micOnRef);

  // --- Daily.co init ---
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
          if (nav.esChromeIOS) setChromeIOS(true);
          else setMobileUrl(data.url);
          setCargando(false);
          return;
        }

        const container = document.getElementById("video-container");
        if (!container) { clearTimeout(timeoutId); setError("Contenedor no encontrado."); setCargando(false); return; }

        setEtapaCarga("Esperando permisos de cámara y micrófono...");

        const callFrame = DailyIframe.createFrame(container, {
          iframeStyle: { width: "100%", height: "100%", border: "0" },
          showLeaveButton: true,
          showFullscreenButton: false,
          showParticipantsBar: false,
          lang: "es",
          theme: { colors: { accent: "#1D9E75", accentText: "#ffffff" } },
          ...({ prejoinUI: false } as Record<string, unknown>),
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
        callFrame.on("participant-updated", (e) => { if (e?.participant?.local) marcarJoined(); });
        callFrame.on("left-meeting", () => {
          if (joinedRef.current) { callFrame.destroy(); frameRef.current = null; window.location.href = "/dashboard"; }
          else { clearTimeout(timeoutId); setError("Videollamada desconectada."); setCargando(false); }
        });
        callFrame.on("error", (ev) => { clearTimeout(timeoutId); setError(`Error: ${ev?.error?.msg || "desconocido"}`); setCargando(false); });
        callFrame.on("participant-left", (ev) => {
          if (ev?.participant && !ev.participant.local) {
            setPacienteSalio(true);
          }
        });

        setEtapaCarga("Conectando... Aceptá los permisos de cámara y micrófono");
        await callFrame.join({ url: data.url });
        if (!joinedRef.current && !unmountedRef.current) setCargando(false);
      } catch (err) {
        clearTimeout(timeoutId);
        if (!unmountedRef.current) { setError("Error al conectar."); setCargando(false); }
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

  async function finalizarConsulta() {
    if (!diagnostico.trim()) {
      setError("El diagnóstico es obligatorio para finalizar.");
      return;
    }
    setFinalizando(true);
    setError(null);

    try {
      const supabase = createClient();

      // Obtener IDs de paciente y médico
      const { data: consultaDb } = await supabase
        .from("consultas")
        .select("paciente_id, medico_id")
        .eq("id", consultaId)
        .single();

      if (!consultaDb || !consultaDb.paciente_id) { setError("Consulta no encontrada."); setFinalizando(false); return; }

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

      if (!paciente || !medico) { setError("Error al obtener datos."); setFinalizando(false); return; }

      // Generar documentos por cada campo completado
      const docs: { tipo: string; contenido: string }[] = [];
      if (receta.trim()) docs.push({ tipo: "receta", contenido: receta.trim() });
      if (indicaciones.trim()) docs.push({ tipo: "indicaciones", contenido: indicaciones.trim() });
      if (certificado.trim()) docs.push({ tipo: "certificado", contenido: certificado.trim() });

      if (docs.length > 0) {
        const inserts = docs.map((d) => ({
          consulta_id: consultaId,
          paciente_id: paciente.id,
          medico_id: medico.id,
          tipo: d.tipo,
          diagnostico: diagnostico.trim(),
          contenido: d.contenido,
        }));
        await supabase.from("documentos").insert(inserts);
      }

      // Finalizar consulta
      await supabase.from("consultas").update({ estado: "completada" }).eq("id", consultaId);

      if (frameRef.current) {
        frameRef.current.leave();
        frameRef.current.destroy();
        frameRef.current = null;
      }

      window.location.href = "/dashboard";
    } catch (err) {
      setError("Error al finalizar. Intentá de nuevo.");
      setFinalizando(false);
    }
  }

  // --- Chrome iOS ---
  if (chromeIOS) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <span className="text-4xl">⚠️</span>
          <h2 className="mt-4 text-lg font-medium text-white">Chrome en iPhone no es compatible</h2>
          <p className="mt-2 text-sm text-gray-400">Copiá el link y abrilo en Safari.</p>
          <button
            onClick={async () => { await navigator.clipboard.writeText(window.location.href); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}
            className="mt-5 w-full rounded-lg bg-amber-500 px-5 py-3 text-sm font-medium text-white"
          >
            {copiado ? "Link copiado" : "Copiar link para Safari"}
          </button>
          <button onClick={() => { window.location.href = "/dashboard"; }} className="mt-2 w-full rounded-lg bg-gray-800 px-5 py-3 text-sm text-gray-400">Volver</button>
        </div>
      </div>
    );
  }

  // --- Mobile ---
  if (mobileUrl) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm text-center">
            <span className="text-4xl">{dailyAbierto ? "🟢" : "📹"}</span>
            <h2 className="mt-4 text-lg font-medium text-white">
              {dailyAbierto ? "Videollamada en curso" : "Videollamada lista"}
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              {consulta.especialidad} — {esMedico ? consulta.paciente_nombre : `Dr. ${consulta.medico_nombre}`}
            </p>

            {!dailyAbierto ? (
              <button
                onClick={() => {
                  const dailyWindow = window.open(mobileUrl!, "_blank");
                  setDailyAbierto(true);
                  if (dailyWindow && !esMedico) {
                    const checkClosed = setInterval(() => {
                      if (dailyWindow.closed) {
                        clearInterval(checkClosed);
                        window.location.href = "/dashboard";
                      }
                    }, 1000);
                  }
                }}
                className="mt-5 w-full rounded-lg bg-[#1D9E75] px-5 py-3.5 text-sm font-medium text-white"
              >
                Unirse a la videollamada
              </button>
            ) : (
              <button
                onClick={() => { window.open(mobileUrl!, "_blank"); }}
                className="mt-5 w-full rounded-lg bg-gray-700 px-5 py-3 text-sm font-medium text-white"
              >
                Volver a la videollamada
              </button>
            )}

            {esMedico && dailyAbierto && (
              <button
                onClick={async () => {
                  setFinalizando(true);
                  const supabase = createClient();

                  if (diagnostico.trim()) {
                    // Obtener paciente_id (auth) desde la consulta
                    const { data: consultaDb } = await supabase
                      .from("consultas").select("paciente_id, medico_id").eq("id", consultaId).single();

                    if (consultaDb && consultaDb.paciente_id) {
                      const { data: pac } = await supabase
                        .from("pacientes").select("id").eq("user_id", consultaDb.paciente_id).single();
                      const { data: med } = await supabase
                        .from("medicos").select("id").eq("id", consultaDb.medico_id).single();

                      if (pac && med) {
                        const docs: { tipo: string; contenido: string }[] = [];
                        if (receta.trim()) docs.push({ tipo: "receta", contenido: receta.trim() });
                        if (indicaciones.trim()) docs.push({ tipo: "indicaciones", contenido: indicaciones.trim() });
                        if (certificado.trim()) docs.push({ tipo: "certificado", contenido: certificado.trim() });
                        if (docs.length === 0) docs.push({ tipo: "indicaciones", contenido: diagnostico.trim() });

                        await supabase.from("documentos").insert(
                          docs.map((d) => ({
                            consulta_id: consultaId,
                            paciente_id: pac.id,
                            medico_id: med.id,
                            tipo: d.tipo,
                            diagnostico: diagnostico.trim(),
                            contenido: d.contenido,
                          }))
                        );
                      }
                    }
                  }

                  await supabase.from("consultas").update({ estado: "completada" }).eq("id", consultaId);
                  window.location.href = "/dashboard";
                }}
                disabled={finalizando}
                className="mt-3 w-full rounded-lg bg-red-600 px-5 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {finalizando ? "Finalizando..." : "Finalizar consulta"}
              </button>
            )}

            {!dailyAbierto && (
              <button onClick={() => { window.location.href = "/dashboard"; }} className="mt-2 w-full rounded-lg bg-gray-800 px-5 py-3 text-sm text-gray-400">
                Volver
              </button>
            )}
          </div>
        </div>

        {/* Floating notes button — solo médico después de abrir Daily */}
        {esMedico && dailyAbierto && !drawerOpen && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-lg"
            style={{ border: "0.5px solid #e5e7eb" }}
          >
            <span className="text-xl">📝</span>
          </button>
        )}

        {/* Drawer de notas */}
        {esMedico && drawerOpen && (
          <div className="fixed inset-0 z-50 flex flex-col">
            <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
            <div className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[#f8f9fa]">
              <div className="sticky top-0 flex items-center justify-between bg-white px-5 py-3 rounded-t-2xl" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
                <p className="text-sm font-medium text-gray-900">Notas de la consulta</p>
                <button onClick={() => setDrawerOpen(false)} className="text-gray-400 text-lg">✕</button>
              </div>
              <div className="px-5 pb-8 pt-2">
                <p className="text-sm text-gray-500">{consulta.paciente_nombre} · {consulta.especialidad}</p>

                <CampoDictado label="DIAGNÓSTICO" campo="diagnostico" value={diagnostico} setter={setDiagnostico} placeholder="Diagnóstico..." required dictando={dictando} onIniciar={() => iniciarDictado("diagnostico", setDiagnostico)} onDetener={detenerDictado} />
                <CampoDictado label="RECETA" campo="receta" value={receta} setter={setReceta} placeholder="Medicamentos, dosis..." dictando={dictando} onIniciar={() => iniciarDictado("receta", setReceta)} onDetener={detenerDictado} />
                <CampoDictado label="INDICACIONES" campo="indicaciones" value={indicaciones} setter={setIndicaciones} placeholder="Indicaciones..." dictando={dictando} onIniciar={() => iniciarDictado("indicaciones", setIndicaciones)} onDetener={detenerDictado} />
                <CampoDictado label="CERTIFICADO" campo="certificado" value={certificado} setter={setCertificado} placeholder="Certificado..." dictando={dictando} onIniciar={() => iniciarDictado("certificado", setCertificado)} onDetener={detenerDictado} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Desktop ---
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Video + controles */}
      <div className="relative flex flex-1 flex-col">
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

        <div id="video-container" className="flex-1" />

        {/* Banner: paciente salió */}
        {pacienteSalio && esMedico && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
            <div className="max-w-sm rounded-xl bg-gray-900 p-6 text-center shadow-2xl" style={{ border: "0.5px solid #333" }}>
              <p className="text-lg font-medium text-white">El paciente ha salido de la llamada</p>
              <p className="mt-2 text-sm text-gray-400">Podés finalizar la consulta o esperar a que vuelva a conectarse.</p>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setPacienteSalio(false)}
                  className="flex-1 rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-600"
                >
                  Esperar
                </button>
                <button
                  onClick={finalizarConsulta}
                  disabled={finalizando}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {finalizando ? "Finalizando..." : "Finalizar consulta"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Controles */}
        {!cargando && !error && (
          <div className="flex items-center justify-center gap-3 bg-gray-900 px-4 py-3">
            <button onClick={toggleMic} className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${micOn ? "bg-gray-800 text-white hover:bg-gray-700" : "bg-red-600 text-white"}`}>
              {micOn ? "🎙️ Micrófono" : "🔇 Silenciado"}
            </button>
            <button onClick={toggleCam} className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${camOn ? "bg-gray-800 text-white hover:bg-gray-700" : "bg-red-600 text-white"}`}>
              {camOn ? "📷 Cámara" : "📷 Apagada"}
            </button>
            {esMedico ? (
              <button
                onClick={finalizarConsulta}
                disabled={finalizando}
                className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {finalizando ? "Finalizando..." : "Finalizar y generar documentos"}
              </button>
            ) : (
              <button
                onClick={async () => {
                  if (frameRef.current) { frameRef.current.leave(); frameRef.current.destroy(); frameRef.current = null; }
                  window.location.href = "/dashboard";
                }}
                className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700"
              >
                Salir de la consulta
              </button>
            )}
          </div>
        )}
      </div>

      {/* Panel derecho — solo médico desktop */}
      {esMedico && (
        <div className="hidden w-80 shrink-0 overflow-y-auto bg-white lg:block" style={{ borderLeft: "0.5px solid #e5e7eb" }}>
          <div className="p-5">
            <p className="text-xs font-medium tracking-wide text-gray-400">PACIENTE</p>
            <p className="mt-2 text-lg font-medium text-gray-900">{consulta.paciente_nombre}</p>
            <p className="mt-0.5 text-sm text-gray-500">{[edad, consulta.especialidad].filter(Boolean).join(" · ")}</p>

            {consulta.motivo_consulta && (
              <div className="mt-4">
                <p className="text-xs font-medium tracking-wide text-gray-400">MOTIVO</p>
                <p className="mt-1 text-sm text-gray-700">{consulta.motivo_consulta}</p>
              </div>
            )}

            {consulta.tiempo_sintomas && (
              <div className="mt-3">
                <p className="text-xs font-medium tracking-wide text-gray-400">TIEMPO</p>
                <p className="mt-0.5 text-xs text-gray-600">{consulta.tiempo_sintomas}</p>
              </div>
            )}

            {consulta.sintomas && consulta.sintomas.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium tracking-wide text-gray-400">SÍNTOMAS</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {consulta.sintomas.map((s) => (
                    <span key={s} className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-600" style={{ border: "0.5px solid #e5e7eb" }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 border-t pt-4" style={{ borderColor: "#e5e7eb" }}>
              <CampoDictado label="DIAGNÓSTICO" campo="diagnostico" value={diagnostico} setter={setDiagnostico} placeholder="Diagnóstico del paciente..." required dictando={dictando} onIniciar={() => iniciarDictado("diagnostico", setDiagnostico)} onDetener={detenerDictado} />
              <CampoDictado label="RECETA" campo="receta" value={receta} setter={setReceta} placeholder="Medicamentos, dosis, frecuencia..." dictando={dictando} onIniciar={() => iniciarDictado("receta", setReceta)} onDetener={detenerDictado} />
              <CampoDictado label="INDICACIONES" campo="indicaciones" value={indicaciones} setter={setIndicaciones} placeholder="Reposo, estudios, derivaciones..." dictando={dictando} onIniciar={() => iniciarDictado("indicaciones", setIndicaciones)} onDetener={detenerDictado} />
              <CampoDictado label="CERTIFICADO" campo="certificado" value={certificado} setter={setCertificado} placeholder="Certificado médico..." dictando={dictando} onIniciar={() => iniciarDictado("certificado", setCertificado)} onDetener={detenerDictado} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
