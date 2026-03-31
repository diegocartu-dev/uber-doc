"use client";

import { useState, useRef, useEffect } from "react";

type Agente = {
  id: string;
  nombre: string;
  rol: string;
  color: string;
  system: string;
};

type Mensaje = { role: "user" | "assistant"; content: string };

const agentes: Agente[] = [
  {
    id: "sofia",
    nombre: "Sofia",
    rol: "Product Designer",
    color: "#1D9E75",
    system:
      "Sos Sofia, Product Designer senior de Docto (docto.com.ar), plataforma argentina de telemedicina. Stack: Next.js + Supabase + Daily.co + Mercado Pago + Vercel. Colores: verde #1D9E75 (disponible), azul #378ADD (reservado), naranja #D85A30 (alerta), gris #888780 (bloqueado), rojo #E24B4A (error), amarillo #BA7517 (pendiente). Módulos: Consulta Inmediata, Turnos Programados con modelos/ciclos, Documentos clínicos. Respondés en español rioplatense, directa y propositiva.",
  },
  {
    id: "marcos",
    nombre: "Marcos",
    rol: "Distinguished Engineer",
    color: "#378ADD",
    system:
      "Sos Marcos, Distinguished Engineer de Docto (docto.com.ar). Stack: Next.js App Router + Supabase (DB + Realtime + RLS) + Daily.co + Mercado Pago + Vercel. Patrones críticos: Supabase Realtime filtra solo por PK, filtrar en JS callbacks. RLS mismatch: paciente_id en consultas = auth.users.id, en documentos = pacientes.id. Respondés en español rioplatense, directo y técnico.",
  },
  {
    id: "elena",
    nombre: "Elena",
    rol: "Product Manager",
    color: "#BA7517",
    system:
      "Sos Elena, Product Manager de Docto (docto.com.ar). Modelo: comisión por consulta sin fee upfront (diferenciador vs Doctoralia/TuDoctor). Médicos MN atienden nationwide, MP solo su provincia. Compliance: Ley 27.553, Decreto 98/2023, ReNaPDiS en trámite. Próximos módulos: B2B con precompra de créditos, Analytics premium con IA. Respondés en español rioplatense, pragmática y orientada a métricas.",
  },
  {
    id: "roberto",
    nombre: "Roberto",
    rol: "QA / Security",
    color: "#D85A30",
    system:
      "Sos Roberto, QA y Seguridad de Docto (docto.com.ar). Stack: Next.js + Supabase RLS + Daily.co + Mercado Pago + Vercel. Compliance: Ley 27.553, ReNaPDiS, SISA/REFEPS. Limitación conocida: Chrome en iPhone incompatible con Daily.co por restricción WebKit. Testing: médico en Chrome, paciente en Safari. Respondés en español rioplatense, meticuloso con edge cases.",
  },
];

export default function EquipoChat() {
  const [seleccionado, setSeleccionado] = useState<string>("sofia");
  const [historiales, setHistoriales] = useState<Record<string, Mensaje[]>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const agente = agentes.find((a) => a.id === seleccionado)!;
  const mensajes = historiales[seleccionado] ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mensajes.length, loading]);

  async function enviar() {
    const texto = input.trim();
    if (!texto || loading) return;

    setInput("");
    setError(null);

    const nuevosMensajes: Mensaje[] = [...mensajes, { role: "user", content: texto }];
    setHistoriales((prev) => ({ ...prev, [seleccionado]: nuevosMensajes }));
    setLoading(true);

    try {
      const res = await fetch("/api/ai-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: agente.system,
          messages: nuevosMensajes.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        setLoading(false);
        return;
      }

      const respuesta = data.content?.[0]?.text ?? "Sin respuesta.";
      setHistoriales((prev) => ({
        ...prev,
        [seleccionado]: [...nuevosMensajes, { role: "assistant", content: respuesta }],
      }));
    } catch {
      setError("Error de conexión.");
    }

    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  return (
    <div className="flex gap-6">
      {/* Grid de agentes */}
      <div className="hidden w-56 shrink-0 space-y-2 lg:block">
        {agentes.map((a) => {
          const activo = a.id === seleccionado;
          return (
            <button
              key={a.id}
              onClick={() => setSeleccionado(a.id)}
              className={`w-full rounded-xl bg-white p-4 text-left transition-all ${activo ? "ring-2" : "hover:shadow-sm"}`}
              style={{
                border: activo ? `2px solid ${a.color}` : "0.5px solid #e5e7eb",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ background: a.color }}
                >
                  {a.nombre[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.nombre}</p>
                  <p className="text-[11px] text-gray-500">{a.rol}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Mobile: selector horizontal */}
      <div className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
        {agentes.map((a) => (
          <button
            key={a.id}
            onClick={() => setSeleccionado(a.id)}
            className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              background: a.id === seleccionado ? a.color : "white",
              color: a.id === seleccionado ? "white" : "#6b7280",
              border: a.id === seleccionado ? "none" : "0.5px solid #e5e7eb",
            }}
          >
            <span className="text-xs font-medium">{a.nombre}</span>
          </button>
        ))}
      </div>

      {/* Chat */}
      <div className="flex min-w-0 flex-1 flex-col rounded-xl bg-white" style={{ border: "0.5px solid #e5e7eb", height: "calc(100vh - 140px)" }}>
        {/* Header del chat */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ background: agente.color }}
          >
            {agente.nombre[0]}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{agente.nombre}</p>
            <p className="text-[11px] text-gray-500">{agente.rol}</p>
          </div>
        </div>

        {/* Mensajes */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {mensajes.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-400">
                Escribile a {agente.nombre} — {agente.rol}
              </p>
            </div>
          )}

          {mensajes.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed"
                style={
                  m.role === "user"
                    ? { background: "#f3f4f6", color: "#1a1a1a" }
                    : { background: agente.color + "10", color: "#1a1a1a", border: `0.5px solid ${agente.color}30` }
                }
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div
                className="rounded-xl px-4 py-2.5 text-sm"
                style={{ background: agente.color + "10", border: `0.5px solid ${agente.color}30` }}
              >
                <span className="inline-flex items-center gap-1 text-gray-400">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: agente.color }} />
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full [animation-delay:150ms]" style={{ background: agente.color }} />
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full [animation-delay:300ms]" style={{ background: agente.color }} />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 pb-2">
            <p className="text-xs text-[#E24B4A]">{error}</p>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Mensaje para ${agente.nombre}...`}
              disabled={loading}
              className="flex-1 rounded-lg bg-[#f8f9fa] px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 disabled:opacity-50"
              style={{ border: "0.5px solid #e5e7eb" }}
            />
            <button
              onClick={enviar}
              disabled={loading || !input.trim()}
              className="shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-all disabled:opacity-50 active:scale-95"
              style={{ background: agente.color }}
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
