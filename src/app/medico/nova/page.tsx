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
import BotonVolver from "@/components/ui/BotonVolver";
import { getFuncion, vozDe, type FuncionAyuda } from "@/lib/nova/manual/funciones-ayuda";
import { matchControl, type ControlManual } from "@/lib/nova/manual/match";

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
  // ── Manual ilustrado (cuentitos curados, 100% client-side) ──
  imagen?: string;
  imagenAlt?: string;
  /** Lo que Nova DICE en voz (separado de `content`, que se VE). */
  narracion?: string;
  manual?: {
    funcionId: string;
    /** -1 = apertura · 0..n-1 = paso · n = cierre */
    pasoActual: number;
    totalPasos: number;
  };
};

// ── Manual ilustrado: construcción de burbujas (puro, sin estado de React) ──
// El avance del manual es 100% local: arma la próxima burbuja y la empuja al
// hilo. NUNCA llama a /api/nova/chat. Diseño: docs/nova-manual-ilustrado.md

function construirBurbujaManual(fn: FuncionAyuda, paso: number): MensajeChat {
  const total = fn.pasos.length;
  const base = { id: crypto.randomUUID(), role: "nova" as const, opcionElegida: null };

  // Apertura
  if (paso < 0) {
    return { ...base, content: fn.apertura, narracion: vozDe(fn.apertura, fn.aperturaNarracion), opciones: ["Empezar →"], manual: { funcionId: fn.id, pasoActual: -1, totalPasos: total } };
  }
  // Cierre — el botón de encadenar solo aparece si ese cuentito existe
  if (paso >= total) {
    const sig = fn.cierre.siguiente;
    const opciones = sig && getFuncion(sig.funcionId) ? [sig.label] : undefined;
    return { ...base, content: fn.cierre.texto, narracion: vozDe(fn.cierre.texto, fn.cierre.narracion), opciones, manual: { funcionId: fn.id, pasoActual: total, totalPasos: total } };
  }
  // Paso
  const p = fn.pasos[paso];
  const esUltimo = paso === total - 1;
  const opciones = [esUltimo ? "Listo ✓" : "Siguiente →"];
  if (paso >= 1) opciones.push("← Atrás");
  return {
    ...base,
    content: p.texto,
    narracion: vozDe(p.texto, p.narracion),
    imagen: p.imagen,
    imagenAlt: p.alt,
    opciones,
    manual: { funcionId: fn.id, pasoActual: paso, totalPasos: total },
  };
}

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
  // Voz ON por default. El médico puede silenciarla si prefiere solo leer.
  const [vozSilenciada, setVozSilenciada] = useState(false);
  const vozSilenciadaRef = useRef(false); // espejo para leerlo sin stale closure en el SSE
  // ── Ola 2: capa conversacional del manual ──
  // Velocidad de la voz (TTS). 1 = normal, 0.75 = lento. Persistida.
  const [velocidadVoz, setVelocidadVoz] = useState(1);
  const velocidadVozRef = useRef(1); // espejo para reproducirTTS sin stale closure
  // Pasos con la ampliación ("No me quedó claro") abierta inline, por id de burbuja.
  const [ampliacionesAbiertas, setAmpliacionesAbiertas] = useState<Set<string>>(new Set());
  // Espejo síncrono del hilo (se asigna en render, antes del flush de effects).
  // El interceptor del input deriva el paso de manual activo en el momento, sin
  // stale closure ni esperar a un effect post-commit.
  const mensajesRef = useRef<MensajeChat[]>(mensajes);
  mensajesRef.current = mensajes;
  const manualSalidoRef = useRef(false); // el médico cerró el cuentito ("ya entendí")
  // Puente para que enviarMensaje (definido antes) llame al dispatcher de
  // controles (definido después). Se sincroniza por effect, evita el TDZ.
  const ejecutarControlRef = useRef<((control: ControlManual, msg: MensajeChat) => void) | null>(null);
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

  // Preferencias persistidas (silencio + velocidad) + refs espejo para el SSE
  useEffect(() => {
    try {
      if (localStorage.getItem("nova_voz_silenciada") === "1") setVozSilenciada(true);
      if (localStorage.getItem("nova_velocidad_voz") === "0.75") {
        setVelocidadVoz(0.75);
        velocidadVozRef.current = 0.75;
      }
    } catch { /* sin localStorage */ }
  }, []);
  useEffect(() => {
    vozSilenciadaRef.current = vozSilenciada;
  }, [vozSilenciada]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, pensando]);

  // ── SSE fetch ──

  const enviarMensaje = useCallback(
    async (texto: string) => {
      const limpio = texto.trim();
      if (!limpio || !medicoId || enviando) return;

      // ── Ola 2: interceptor del manual conversacional ──
      // Si hay un cuentito activo y el médico pidió un CONTROL (repetir, más
      // lento, volvé, siguiente, no entiendo, salir), se resuelve 100% local —
      // NUNCA llega al LLM. Igual se muestra lo que dijo como burbuja del médico.
      // El paso activo se deriva en el momento (espejo síncrono del hilo).
      const activoManual = manualSalidoRef.current
        ? null
        : [...mensajesRef.current].reverse().find((m) => m.manual) ?? null;
      if (activoManual?.manual) {
        const control = matchControl(limpio);
        if (control) {
          setInput("");
          setMensajes((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "user", content: limpio },
          ]);
          ejecutarControlRef.current?.(control, activoManual);
          return;
        }
      }

      const userMsg: MensajeChat = {
        id: crypto.randomUUID(),
        role: "user",
        content: limpio,
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
                // TTS solo en respuestas cortas/conversacionales (≤200 chars) y si
                // el médico NO silenció la voz. Respuestas largas no se leen solas.
                if (novaTexto && novaTexto.length <= 200 && !vozSilenciadaRef.current) {
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
          audio.currentTime = 0;
        }).catch(() => {}).finally(() => {
          // Pase lo que pase con el play de desbloqueo, NUNCA dejar el elemento
          // muteado (era la causa de que la voz saliera muda en iPhone).
          audio.muted = false;
        });
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
        body: JSON.stringify({ texto, speed: velocidadVozRef.current }),
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
      // FIX (diagnosticado 02/06): el desbloqueo de iOS puede dejar el elemento
      // en muted=true (su play() de desbloqueo falla y nunca des-silencia) → la
      // voz se reproducía MUDA. Forzamos muted=false acá, siempre, antes de sonar.
      audio.muted = false;
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

  // Silenciar / reactivar la voz de Nova. Por default habla; el médico la apaga
  // si prefiere solo leer. Al silenciar, corta lo que esté sonando.
  const toggleSilencio = useCallback(() => {
    setVozSilenciada((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("nova_voz_silenciada", next ? "1" : "0");
      } catch { /* sin localStorage */ }
      if (next) detenerAudio();
      return next;
    });
  }, [detenerAudio]);

  // ── Manual ilustrado (cuentitos) — 100% client-side, NUNCA toca el LLM ──

  const iniciarManual = useCallback(
    (funcionId: string) => {
      const fn = getFuncion(funcionId);
      if (!fn) return;
      manualSalidoRef.current = false; // arranca un cuentito → el manual vuelve a estar activo
      const burbuja = construirBurbujaManual(fn, -1);
      setMensajes((prev) => [...prev, burbuja]);
      if (!vozSilenciadaRef.current) reproducirTTS(burbuja.narracion ?? burbuja.content);
    },
    [reproducirTTS]
  );

  const avanzarManual = useCallback(
    (manual: NonNullable<MensajeChat["manual"]>, opcion: string) => {
      const fn = getFuncion(manual.funcionId);
      if (!fn) return;
      const total = fn.pasos.length;

      // En el cierre, el único avance posible es encadenar al siguiente cuentito
      if (manual.pasoActual >= total) {
        const sig = fn.cierre.siguiente;
        if (sig && opcion === sig.label) iniciarManual(sig.funcionId);
        return;
      }

      let target: number;
      if (opcion === "← Atrás") target = manual.pasoActual - 1;
      else if (manual.pasoActual < 0) target = 0; // apertura → paso 1
      else if (manual.pasoActual < total - 1) target = manual.pasoActual + 1;
      else target = total; // último paso → cierre

      const burbuja = construirBurbujaManual(fn, target);
      setMensajes((prev) => [...prev, burbuja]);
      if (!vozSilenciadaRef.current) reproducirTTS(burbuja.narracion ?? burbuja.content);
    },
    [iniciarManual, reproducirTTS]
  );

  // ── Ola 2: capa conversacional (controles que NO consumen el paso) ──

  // Lo que Nova DICE en el paso actual (narración, no el texto de pantalla).
  // Usado por "↺ Repetir" y por el cambio de velocidad (re-narrar).
  const vozDelPaso = useCallback((manual: NonNullable<MensajeChat["manual"]>): string => {
    const fn = getFuncion(manual.funcionId);
    if (!fn) return "";
    if (manual.pasoActual < 0) return vozDe(fn.apertura, fn.aperturaNarracion);
    if (manual.pasoActual >= manual.totalPasos) return vozDe(fn.cierre.texto, fn.cierre.narracion);
    const p = fn.pasos[manual.pasoActual];
    return vozDe(p.texto, p.narracion);
  }, []);

  // "↺ Repetir": re-narra el paso actual. No avanza, no muta el hilo.
  const repetirPaso = useCallback(
    (manual: NonNullable<MensajeChat["manual"]>) => {
      reproducirTTS(vozDelPaso(manual)); // explícito: repetir suena aunque la voz esté en silencio global
    },
    [reproducirTTS, vozDelPaso]
  );

  // "No me quedó claro": abre/cierra la ampliación curada inline (misma burbuja).
  const toggleAmpliacion = useCallback(
    (msg: MensajeChat) => {
      if (!msg.manual) return;
      const fn = getFuncion(msg.manual.funcionId);
      const paso = fn && msg.manual.pasoActual >= 0 ? fn.pasos[msg.manual.pasoActual] : undefined;
      const amp = paso?.ampliacion;
      let abriendo = false;
      setAmpliacionesAbiertas((prev) => {
        const next = new Set(prev);
        if (next.has(msg.id)) next.delete(msg.id);
        else { next.add(msg.id); abriendo = true; }
        return next;
      });
      // Acción explícita del médico → narra aunque la voz esté en silencio global
      // (el silencio es para la narración automática, no para lo que pide a mano).
      if (abriendo && amp) reproducirTTS(vozDe(amp.texto, amp.narracion));
    },
    [reproducirTTS]
  );

  // "Más despacio" / "Velocidad normal": alterna la velocidad de la voz y re-narra
  // para que el médico ESCUCHE el cambio. Persiste la preferencia.
  const toggleVelocidad = useCallback(
    (manual: NonNullable<MensajeChat["manual"]>) => {
      const next = velocidadVozRef.current === 1 ? 0.75 : 1;
      velocidadVozRef.current = next;
      setVelocidadVoz(next);
      try {
        localStorage.setItem("nova_velocidad_voz", String(next));
      } catch { /* sin localStorage */ }
      reproducirTTS(vozDelPaso(manual));
    },
    [reproducirTTS, vozDelPaso]
  );

  // Dispatcher de los controles reconocidos por voz/texto durante un cuentito.
  // Recibe la burbuja activa (necesita su id para la ampliación inline).
  const ejecutarControl = useCallback(
    (control: ControlManual, msg: MensajeChat) => {
      const manual = msg.manual;
      if (!manual) return;
      switch (control) {
        case "repetir":
          repetirPaso(manual);
          break;
        case "no-entiendo": {
          const fn = getFuncion(manual.funcionId);
          const paso =
            fn && manual.pasoActual >= 0 && manual.pasoActual < manual.totalPasos
              ? fn.pasos[manual.pasoActual]
              : undefined;
          if (paso?.ampliacion) {
            setAmpliacionesAbiertas((prev) => new Set(prev).add(msg.id));
            reproducirTTS(vozDe(paso.ampliacion.texto, paso.ampliacion.narracion)); // acción explícita → suena aunque esté en silencio
          } else {
            repetirPaso(manual); // sin ampliación → al menos repetir
          }
          break;
        }
        case "mas-lento":
          if (velocidadVozRef.current !== 0.75) toggleVelocidad(manual);
          else repetirPaso(manual);
          break;
        case "siguiente": {
          const esUltimoPaso = manual.pasoActual >= 0 && manual.pasoActual >= manual.totalPasos - 1;
          avanzarManual(manual, esUltimoPaso ? "Listo ✓" : "Siguiente →");
          break;
        }
        case "atras":
          if (manual.pasoActual >= 1) avanzarManual(manual, "← Atrás");
          break;
        case "salir":
          manualSalidoRef.current = true;
          setMensajes((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "nova", content: "¡Listo! Cualquier cosa, preguntame nomás. 😊" },
          ]);
          break;
      }
    },
    [repetirPaso, toggleVelocidad, avanzarManual, reproducirTTS]
  );

  // Puente enviarMensaje → ejecutarControl (ver ejecutarControlRef arriba).
  useEffect(() => {
    ejecutarControlRef.current = ejecutarControl;
  }, [ejecutarControl]);

  // Deep link: /medico/nova?walkthrough=<id> abre Nova directo en ese cuentito
  const walkthroughIniciado = useRef(false);
  useEffect(() => {
    if (walkthroughIniciado.current || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("walkthrough");
    if (id && getFuncion(id)) {
      walkthroughIniciado.current = true;
      iniciarManual(id);
    }
  }, [iniciarManual]);

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
    (msg: MensajeChat, opcion: string) => {
      setMensajes((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, opcionElegida: opcion } : m))
      );
      // Paso del manual → avance local (cero LLM). Si no, va al chat de Nova.
      if (msg.manual) avanzarManual(msg.manual, opcion);
      else enviarMensaje(opcion);
    },
    [enviarMensaje, avanzarManual]
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
  // Id de la última burbuja de manual (el paso "activo"): solo ahí se muestran
  // los controles (Repetir / No me quedó claro / Más despacio).
  const ultimoManualId = [...mensajes].reverse().find((m) => m.manual)?.id;

  // En un cuentito, toda opción que NO es "← Atrás" avanza (acción primaria →
  // azul relleno). "← Atrás" es secundaria (borde azul).
  const esNavPrimaria = (op: string) => op !== "← Atrás";

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
        {/* Botón para silenciar / reactivar la voz (habla por default) */}
        <button
          onClick={toggleSilencio}
          aria-label={vozSilenciada ? "Activar la voz de Nova" : "Silenciar la voz de Nova"}
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:opacity-60"
          style={{ border: "0.5px solid #e5e7eb", color: vozSilenciada ? "#888780" : "#378ADD" }}
        >
          {vozSilenciada ? (
            // Altavoz silenciado
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            // Altavoz con ondas (voz activa)
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
        </button>
      </header>
      <BotonVolver />

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

          {mensajes.map((msg) => {
            const esManualPaso =
              !!msg.manual && msg.manual.pasoActual >= 0 && msg.manual.pasoActual < msg.manual.totalPasos;
            const fnManual = msg.manual ? getFuncion(msg.manual.funcionId) : undefined;
            const ampliacion =
              esManualPaso && fnManual ? fnManual.pasos[msg.manual!.pasoActual].ampliacion : undefined;
            const esPasoActivo = esManualPaso && msg.id === ultimoManualId;
            const ampAbierta = ampliacionesAbiertas.has(msg.id);
            return (
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
                {/* Contador de paso del manual ilustrado */}
                {msg.manual && msg.manual.pasoActual >= 0 && msg.manual.pasoActual < msg.manual.totalPasos && (
                  <p className="mb-1 text-[11px] font-medium" style={{ color: "#888780" }}>
                    Paso {msg.manual.pasoActual + 1} de {msg.manual.totalPasos}
                  </p>
                )}

                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                  {msg.content}
                </p>

                {/* Imagen del manual (señalador quemado en la foto, azul #378ADD) */}
                {msg.imagen && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={msg.imagen}
                    alt={msg.imagenAlt || ""}
                    loading="lazy"
                    className="mt-2 w-full rounded-lg"
                    style={{ border: "0.5px solid #e5e7eb" }}
                  />
                )}

                {/* Ampliación inline ("No me quedó claro") — curada, sin LLM */}
                {ampAbierta && ampliacion && (
                  <div className="mt-2 rounded-lg p-3" style={{ background: "#f8f9fa", border: "0.5px solid #e5e7eb" }}>
                    <p className="mb-1 text-[11px] font-medium" style={{ color: "#888780" }}>
                      Con más detalle
                    </p>
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{ampliacion.texto}</p>
                    {ampliacion.imagen && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ampliacion.imagen}
                        alt={ampliacion.alt || ""}
                        loading="lazy"
                        className="mt-2 w-full rounded-lg"
                        style={{ border: "0.5px solid #e5e7eb" }}
                      />
                    )}
                  </div>
                )}

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
                  <div className="mt-2.5 flex gap-3">
                    <button
                      onClick={() => confirmarAccion(msg.id, "si")}
                      disabled={pensando}
                      className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-[#378ADD] px-4 text-[13px] font-medium text-white active:scale-95 transition-all disabled:opacity-70"
                    >
                      {pensando && (
                        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                          <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                      )}
                      {pensando ? "Confirmando..." : "Confirmar"}
                    </button>
                    <button
                      onClick={() => confirmarAccion(msg.id, "no")}
                      disabled={pensando}
                      className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-transparent px-4 text-[13px] font-medium text-[#6b7280] active:scale-95 transition-all disabled:opacity-50"
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

                {/* Botones de opciones / navegación del manual */}
                {msg.opciones && !msg.opcionElegida && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {msg.opciones.map((op) => {
                      // En el manual, la acción que avanza va en azul relleno (primaria);
                      // "← Atrás" en borde azul. Fuera del manual, todo borde azul (como antes).
                      const primaria = msg.manual && esNavPrimaria(op);
                      return (
                        <button
                          key={op}
                          onClick={() => elegirOpcion(msg, op)}
                          className={`flex min-h-[48px] items-center rounded-lg px-4 text-[13px] font-medium active:scale-95 transition-transform ${
                            primaria ? "text-white" : "text-[#378ADD]"
                          }`}
                          style={primaria ? { background: "#378ADD" } : { border: "1px solid #378ADD" }}
                        >
                          {op}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Controles del paso activo: NO consumen el paso (no setean opcionElegida) */}
                {esPasoActivo && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => repetirPaso(msg.manual!)}
                      className="flex min-h-[48px] items-center rounded-lg px-3 text-[13px] font-medium active:scale-95 transition-transform"
                      style={{ color: "#888780", border: "0.5px solid #e5e7eb" }}
                    >
                      ↺ Repetir
                    </button>
                    {ampliacion && (
                      <button
                        onClick={() => toggleAmpliacion(msg)}
                        className="flex min-h-[48px] items-center rounded-lg px-3 text-[13px] font-medium active:scale-95 transition-transform"
                        style={{ color: "#888780", border: "0.5px solid #e5e7eb" }}
                      >
                        {ampAbierta ? "← Volver al paso" : "No me quedó claro"}
                      </button>
                    )}
                    <button
                      onClick={() => toggleVelocidad(msg.manual!)}
                      className="flex min-h-[48px] items-center rounded-lg px-3 text-[13px] font-medium active:scale-95 transition-transform"
                      style={{ color: "#888780", border: "0.5px solid #e5e7eb" }}
                    >
                      {velocidadVoz === 1 ? "Más despacio" : "Velocidad normal"}
                    </button>
                  </div>
                )}

                {msg.opcionElegida && !msg.manual && (
                  <p className="mt-2 text-xs text-[#1D9E75]">{msg.opcionElegida}</p>
                )}
              </div>
            </div>
            );
          })}

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
