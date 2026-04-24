"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Breadcrumb from "@/components/Breadcrumb";

// ── Types ──

type MensajeChat = {
  id: string;
  role: "user" | "nova";
  content: string;
  confirmacion?: {
    accion: string;
    descripcion: string;
    datos: Record<string, unknown>;
  };
  confirmado?: "si" | "no" | null;
  opciones?: string[];
  opcionElegida?: string | null;
};

// ── Beep de UI con AudioContext (sin assets externos) ──

function beepUI(freq: number, duracionMs: number, volumen = 0.25) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(volumen, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duracionMs / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duracionMs / 1000);
  } catch { /* AudioContext no disponible */ }
}

// ── SpeechRecognition hook ──

function useDictado() {
  const recRef = useRef<any>(null);
  const [dictando, setDictando] = useState(false);
  const [iniciando, setIniciando] = useState(false); // estado entre click y permisos
  const [interimText, setInterimText] = useState(""); // texto parcial en tiempo real
  const detenidoManual = useRef(false);

  const iniciar = useCallback(
    async (setter: (fn: (prev: string) => string) => void) => {
      if (typeof window === "undefined") return;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;

      setIniciando(true);

      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setIniciando(false);
        return;
      }

      const rec = new SR();
      rec.lang = "es-AR";
      rec.continuous = true;
      rec.interimResults = true;
      detenidoManual.current = false;

      rec.onresult = (e: any) => {
        let finalTranscript = "";
        let interimTranscript = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            finalTranscript += e.results[i][0].transcript;
          } else {
            interimTranscript += e.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setter((prev) => (prev ? prev + " " : "") + finalTranscript);
          setInterimText("");
        } else if (interimTranscript) {
          setInterimText(interimTranscript);
        }
      };

      rec.onerror = () => {
        detenidoManual.current = true;
        recRef.current = null;
        setDictando(false);
        setIniciando(false);
        setInterimText("");
      };

      rec.onend = () => {
        if (!detenidoManual.current) {
          recRef.current = null;
          setDictando(false);
          setIniciando(false);
          setInterimText("");
        }
      };

      recRef.current = rec;
      rec.start();
      setDictando(true);
      setIniciando(false);
    },
    []
  );

  const detener = useCallback(() => {
    detenidoManual.current = true;
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch { /* ya detenido */ }
      recRef.current = null;
    }
    setDictando(false);
    setIniciando(false);
    setInterimText("");
  }, []);

  return { dictando, iniciando, interimText, iniciar, detener };
}

// ── Component ──

export default function NovaChat() {
  const router = useRouter();
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [medicoId, setMedicoId] = useState<string | null>(null);
  const [hablando, setHablando] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioDesbloqueado = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { dictando, iniciando, interimText, iniciar: iniciarDictado, detener: detenerDictado } = useDictado();

  // Auth
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setMedicoId(user.id);
    });
  }, [router]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, pensando]);

  // ── SSE fetch ──

  const enviarMensaje = useCallback(
    async (texto: string) => {
      if (!texto.trim() || !medicoId || enviando) return;

      const userMsg: MensajeChat = {
        id: crypto.randomUUID(),
        role: "user",
        content: texto.trim(),
      };

      const mensajesActualizados = [...mensajes, userMsg];
      setMensajes(mensajesActualizados);
      setInput("");
      setEnviando(true);
      setPensando(true);

      try {
        // Enviar historial completo (solo role y content)
        const historial = mensajesActualizados.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/nova/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensajes: historial, medico_id: medicoId }),
        });

        if (!res.ok || !res.body) {
          throw new Error("Error de conexion");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let novaTexto = "";
        let novaId = crypto.randomUUID();
        let confirmacionData: MensajeChat["confirmacion"] | undefined;
        let primerChunk = true;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);

            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "text") {
                if (primerChunk) {
                  setPensando(false);
                  primerChunk = false;
                }
                novaTexto += event.content;
                setMensajes((prev) => {
                  const existing = prev.find((m) => m.id === novaId);
                  if (existing) {
                    return prev.map((m) =>
                      m.id === novaId ? { ...m, content: novaTexto } : m
                    );
                  }
                  return [
                    ...prev,
                    { id: novaId, role: "nova" as const, content: novaTexto },
                  ];
                });
              }

              if (event.type === "confirmacion") {
                if (primerChunk) {
                  setPensando(false);
                  primerChunk = false;
                }
                confirmacionData = {
                  accion: event.accion,
                  descripcion: event.descripcion,
                  datos: event.datos,
                };
                // Se adjunta al mensaje de Nova actual o se crea nuevo
                setMensajes((prev) => {
                  const existing = prev.find((m) => m.id === novaId);
                  if (existing) {
                    return prev.map((m) =>
                      m.id === novaId
                        ? { ...m, confirmacion: confirmacionData, confirmado: null }
                        : m
                    );
                  }
                  return [
                    ...prev,
                    {
                      id: novaId,
                      role: "nova" as const,
                      content: novaTexto || event.descripcion,
                      confirmacion: confirmacionData,
                      confirmado: null,
                    },
                  ];
                });
              }

              if (event.type === "opciones") {
                if (primerChunk) {
                  setPensando(false);
                  primerChunk = false;
                }
                const opcs = event.opciones as string[];
                setMensajes((prev) => {
                  const existing = prev.find((m) => m.id === novaId);
                  if (existing) {
                    return prev.map((m) =>
                      m.id === novaId ? { ...m, opciones: opcs, opcionElegida: null } : m
                    );
                  }
                  return [
                    ...prev,
                    { id: novaId, role: "nova" as const, content: novaTexto, opciones: opcs, opcionElegida: null },
                  ];
                });
              }

              if (event.type === "done") {
                setPensando(false);
                // TTS solo en respuestas cortas/conversacionales (≤200 chars)
                // Respuestas largas (agendas, listas) no se leen automáticamente
                if (novaTexto && novaTexto.length <= 200) {
                  reproducirTTS(novaTexto);
                }
              }

              if (event.type === "error") {
                setPensando(false);
                setMensajes((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: "nova",
                    content: `Error: ${event.content}`,
                  },
                ]);
              }
            } catch {
              // JSON parse error — skip line
            }
          }
        }
      } catch {
        setPensando(false);
        setMensajes((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "nova",
            content: "No pude conectarme. Intenta de nuevo.",
          },
        ]);
      } finally {
        setEnviando(false);
        setPensando(false);
      }
    },
    [medicoId, enviando]
  );

  // ── TTS ──

  // Desbloquear audio en el contexto de gesto del usuario (click/touch)
  const desbloquearAudio = useCallback(() => {
    if (audioDesbloqueado.current) return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      audioDesbloqueado.current = true;

      const audio = audioRef.current;
      if (audio) {
        audio.muted = true;
        audio.play().then(() => {
          audio.pause();
          audio.muted = false;
          audio.currentTime = 0;
        }).catch(() => {});
      }
    } catch {
      // Fallback: intentar de nuevo en el próximo gesto
    }
  }, []);

  const reproducirTTS = useCallback(async (texto: string) => {
    try {
      const res = await fetch("/api/nova/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });

      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = audioRef.current;
      if (!audio) return;

      // Limpiar URL anterior si existe
      const urlAnterior = audio.src;

      audio.onplay = () => setHablando(true);
      audio.onended = () => {
        setHablando(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setHablando(false);
        URL.revokeObjectURL(url);
      };

      audio.src = url;
      audio.volume = 1;
      await audio.play().catch(() => {
        // Autoplay bloqueado — fallback silencioso
        setHablando(false);
        URL.revokeObjectURL(url);
      });

      // Limpiar URL anterior
      if (urlAnterior && urlAnterior.startsWith("blob:")) {
        URL.revokeObjectURL(urlAnterior);
      }
    } catch {
      // TTS falló silenciosamente
    }
  }, []);

  const detenerAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setHablando(false);
  }, []);

  // ── Confirmar accion ──

  const confirmarAccion = useCallback(
    async (msgId: string, decision: "si" | "no") => {
      const msg = mensajes.find((m) => m.id === msgId);
      if (!msg?.confirmacion || !medicoId) return;

      setMensajes((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, confirmado: decision } : m
        )
      );

      if (decision === "no") {
        setMensajes((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "nova",
            content: "Entendido, no se realizaron cambios.",
          },
        ]);
        return;
      }

      setPensando(true);
      try {
        const res = await fetch("/api/nova/confirmar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accion: msg.confirmacion.accion,
            datos: msg.confirmacion.datos,
            medico_id: medicoId,
          }),
        });

        const data = await res.json();
        setMensajes((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "nova",
            content: data.exito
              ? data.mensaje
              : `No pude completar la accion: ${data.mensaje}`,
          },
        ]);
      } catch {
        setMensajes((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "nova",
            content: "Error al ejecutar la accion. Intenta de nuevo.",
          },
        ]);
      } finally {
        setPensando(false);
      }
    },
    [mensajes, medicoId]
  );

  const elegirOpcion = useCallback(
    (msgId: string, opcion: string) => {
      setMensajes((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, opcionElegida: opcion } : m
        )
      );
      enviarMensaje(opcion);
    },
    [enviarMensaje]
  );

  // ── Mic toggle ──

  const toggleMic = useCallback(() => {
    desbloquearAudio();
    if (dictando) {
      beepUI(440, 120);
      detenerDictado();
    } else {
      beepUI(880, 80);
      iniciarDictado(setInput);
    }
  }, [dictando, iniciarDictado, detenerDictado, desbloquearAudio]);

  // ── Enviar con Enter ──

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      desbloquearAudio();
      if (dictando) detenerDictado();
      enviarMensaje(input);
    }
  };

  const hayTexto = input.trim().length > 0;

  return (
    <div className="flex h-dvh flex-col bg-[#f8f9fa]">
      {/* ── Header ── */}
      <header
        className="flex h-14 shrink-0 items-center justify-between bg-white px-4"
        style={{ borderBottom: "0.5px solid #e5e7eb" }}
      >
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#1D9E75]" />
          <span className="text-lg font-medium text-[#1a1a1a]">Nova</span>
        </div>
      </header>
      <Breadcrumb />

      {/* ── Barra TTS ── */}
      {hablando && (
        <div
          className="flex h-10 shrink-0 items-center justify-between px-4"
          style={{ background: "linear-gradient(90deg, #378ADD, #2e6fb5)" }}
        >
          <div className="flex items-center gap-2">
            <div className="flex items-end gap-[3px]">
              <span className="nova-sound-bar" style={{ height: 8 }} />
              <span className="nova-sound-bar" style={{ height: 16, animationDelay: "0.15s" }} />
              <span className="nova-sound-bar" style={{ height: 12, animationDelay: "0.3s" }} />
            </div>
            <span className="text-[13px] font-medium text-white">
              Nova esta hablando
            </span>
          </div>
          <button
            onClick={detenerAudio}
            className="text-xs text-white/70 underline"
          >
            Detener
          </button>
        </div>
      )}

      {/* ── Mensajes ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] px-4 py-4 md:px-6 md:py-6">
          {mensajes.length === 0 && !pensando && (
            <div className="flex h-full items-center justify-center py-20">
              <div className="text-center">
                <p className="text-[15px] text-gray-400">
                  Hola, soy Nova. Preguntame sobre tu agenda, turnos o lo que necesites.
                </p>
              </div>
            </div>
          )}

          {mensajes.map((msg) => (
            <div
              key={msg.id}
              className={`mb-2 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  msg.role === "user"
                    ? "nova-bubble-user"
                    : "nova-bubble-nova"
                }
              >
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                  {msg.content}
                </p>

                {/* Chip canal + duración */}
                {!!msg.confirmacion?.datos?.canal_origen && (
                  <div className="flex gap-2 mt-2 mb-3">
                    <span className="text-xs font-medium rounded-full px-3 py-1" style={{ background: "#f3f4f6", color: "#6b7280" }}>
                      {(msg.confirmacion.datos.canal_origen as string) === "clinica_virtual" ? "Clínica Virtual" : "Consultorio Particular"}
                    </span>
                    {!!msg.confirmacion.datos.duracion && (
                      <span className="text-xs font-medium rounded-full px-3 py-1" style={{ background: "#f3f4f6", color: "#6b7280" }}>
                        {String(msg.confirmacion.datos.duracion)} min
                      </span>
                    )}
                  </div>
                )}

                {/* Botones confirmacion */}
                {msg.confirmacion && !msg.confirmado && (
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => confirmarAccion(msg.id, "si")}
                      className="rounded-lg bg-[#378ADD] px-4 py-2 text-[13px] font-medium text-white active:scale-95 transition-transform"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => confirmarAccion(msg.id, "no")}
                      className="rounded-lg bg-transparent px-4 py-2 text-[13px] font-medium text-[#6b7280] active:scale-95 transition-transform"
                      style={{ border: "0.5px solid #e5e7eb" }}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
                {msg.confirmado === "si" && (
                  <p className="mt-2 text-xs text-[#1D9E75]">Confirmado</p>
                )}
                {msg.confirmado === "no" && (
                  <p className="mt-2 text-xs text-[#6b7280]">Cancelado</p>
                )}

                {/* Botones de opciones (disambiguación) */}
                {msg.opciones && !msg.opcionElegida && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {msg.opciones.map((op) => (
                      <button
                        key={op}
                        onClick={() => elegirOpcion(msg.id, op)}
                        className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#378ADD] active:scale-95 transition-transform"
                        style={{ border: "1px solid #378ADD" }}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                )}
                {msg.opcionElegida && (
                  <p className="mt-2 text-xs text-[#1D9E75]">{msg.opcionElegida}</p>
                )}
              </div>
            </div>
          ))}

          {/* Pensando */}
          {pensando && (
            <div className="mb-2 flex justify-start">
              <div className="nova-bubble-nova">
                <div className="flex items-center gap-1.5">
                  <span className="nova-dot" style={{ animationDelay: "0s" }} />
                  <span className="nova-dot" style={{ animationDelay: "0.15s" }} />
                  <span className="nova-dot" style={{ animationDelay: "0.3s" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input bar ── */}
      <div
        className="shrink-0 bg-white px-4 pb-3 pt-2"
        style={{ borderTop: "0.5px solid #e5e7eb" }}
      >
        {/* Preview de texto parcial durante dictado */}
        {dictando && (
          <div className="mx-auto mb-1.5 max-w-[640px] pl-14 pr-14">
            <p className="truncate text-[13px] text-[#6b7280]">
              {interimText ? `"${interimText}"` : "Escuchando..."}
            </p>
          </div>
        )}

        <div className="mx-auto flex max-w-[640px] items-center gap-2">
          {/* Mic */}
          <button
            onClick={toggleMic}
            disabled={iniciando}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all ${
              dictando
                ? "bg-[#D85A30] shadow-[0_0_0_6px_rgba(216,90,48,0.2)] animate-pulse"
                : iniciando
                ? "bg-[#f8f9fa] opacity-50"
                : "bg-[#f8f9fa]"
            }`}
            style={!dictando ? { border: "0.5px solid #e5e7eb" } : undefined}
          >
            {dictando ? (
              /* Cuadrado blanco = stop, visible sobre fondo rojo */
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="2" width="10" height="10" rx="2" fill="white"/>
              </svg>
            ) : iniciando ? (
              /* Spinner mientras se piden permisos */
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
            ) : (
              /* Ícono de micrófono normal */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
              </svg>
            )}
          </button>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={dictando ? "Dictando..." : "Escribí o dictá tu mensaje..."}
            disabled={enviando}
            className="h-11 flex-1 rounded-[22px] bg-[#f8f9fa] px-4 text-[15px] text-[#1a1a1a] placeholder:text-gray-400 focus:outline-none focus:ring-0 nova-input"
            style={{ border: dictando ? "1.5px solid #D85A30" : "0.5px solid #e5e7eb" }}
          />

          {/* Send */}
          <button
            onClick={() => {
              desbloquearAudio();
              if (dictando) detenerDictado();
              enviarMensaje(input);
            }}
            disabled={!hayTexto || enviando}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
              hayTexto && !enviando
                ? "bg-[#378ADD] text-white"
                : "bg-[#e5e7eb] text-white"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>

      {/* Audio persistente para TTS (desbloqueo mobile) */}
      <audio ref={audioRef} playsInline />

      {/* ── Styles ── */}
      <style jsx>{`
        .nova-bubble-user {
          max-width: 80%;
          background: #1D9E75;
          color: white;
          padding: 10px 14px;
          border-radius: 16px 16px 4px 16px;
          font-size: 15px;
          line-height: 1.5;
        }
        .nova-bubble-nova {
          max-width: 80%;
          background: white;
          border: 0.5px solid #e5e7eb;
          color: #1a1a1a;
          padding: 10px 14px;
          border-radius: 16px 16px 16px 4px;
          font-size: 15px;
          line-height: 1.5;
        }
        .nova-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          background: #9ca3af;
          border-radius: 50%;
          animation: novaBounce 1.2s infinite;
        }
        @keyframes novaBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
        .nova-sound-bar {
          display: inline-block;
          width: 3px;
          border-radius: 2px;
          background: white;
          animation: novaSound 0.8s infinite alternate;
        }
        @keyframes novaSound {
          0% { height: 8px; }
          100% { height: 16px; }
        }
        .nova-input:focus {
          border-color: #1D9E75 !important;
          box-shadow: 0 0 0 2px rgba(29,158,117,0.15);
        }
      `}</style>
    </div>
  );
}
