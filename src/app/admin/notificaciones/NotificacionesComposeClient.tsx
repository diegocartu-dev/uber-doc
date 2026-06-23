"use client";

import { useState } from "react";
import { Send, Search } from "lucide-react";

type Medico = { id: string; nombre: string; estado: string };
type Target = "medico" | "no_validados" | "todos";

const ESTADO_LABEL: Record<string, string> = {
  pendiente_revision: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  suspendido: "Suspendido",
};

export default function NotificacionesComposeClient({
  medicos,
  totalInscriptos,
  totalNoValidados,
}: {
  medicos: Medico[];
  totalInscriptos: number;
  totalNoValidados: number;
}) {
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [target, setTarget] = useState<Target>("medico");
  const [medicoId, setMedicoId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const medicosFiltrados = busqueda.trim()
    ? medicos.filter((m) => m.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : medicos;
  const medicoElegido = medicos.find((m) => m.id === medicoId);

  async function enviar() {
    setError(null);
    setResultado(null);
    if (!titulo.trim() || !mensaje.trim()) {
      setError("Completá título y mensaje.");
      return;
    }
    if (target === "medico" && !medicoId) {
      setError("Elegí un médico.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/notificaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo,
          mensaje,
          target: { tipo: target, medicoId: target === "medico" ? medicoId : undefined },
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "No se pudo enviar.");
      } else {
        setResultado(`Enviada a ${d.enviadas} médico${d.enviadas === 1 ? "" : "s"}.`);
        setTitulo("");
        setMensaje("");
        setMedicoId("");
        setBusqueda("");
      }
    } catch {
      setError("Error de red.");
    } finally {
      setEnviando(false);
    }
  }

  const opciones: { tipo: Target; label: string; detalle: string }[] = [
    { tipo: "medico", label: "Un médico", detalle: "Elegís uno de la lista" },
    { tipo: "no_validados", label: "No validados", detalle: `${totalNoValidados} sin identidad validada` },
    { tipo: "todos", label: "Todos los inscriptos", detalle: `${totalInscriptos} médicos (cualquier estado)` },
  ];

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Título</label>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={80}
          placeholder="Ej: Validá tu identidad para empezar a atender"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#378ADD] focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Mensaje</label>
        <textarea
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          rows={4}
          maxLength={600}
          placeholder="Escribí el mensaje que verá el médico en su campanita."
          className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#378ADD] focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Para</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {opciones.map((o) => (
            <button
              key={o.tipo}
              type="button"
              onClick={() => setTarget(o.tipo)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                target === o.tipo ? "border-[#378ADD] bg-[#378ADD0F]" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="text-sm font-medium text-gray-900">{o.label}</div>
              <div className="mt-0.5 text-xs text-gray-500">{o.detalle}</div>
            </button>
          ))}
        </div>
      </div>

      {target === "medico" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Elegí el médico</label>
          {medicoElegido && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-[#378ADD0F] px-3 py-2 text-sm">
              <span className="font-medium text-gray-900">{medicoElegido.nombre}</span>
              <button onClick={() => setMedicoId("")} className="text-xs text-[#378ADD]">Cambiar</button>
            </div>
          )}
          {!medicoElegido && (
            <>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre…"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-[#378ADD] focus:outline-none"
                />
              </div>
              <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-100">
                {medicosFiltrados.length === 0 && (
                  <div className="px-3 py-3 text-sm text-gray-400">Sin resultados.</div>
                )}
                {medicosFiltrados.slice(0, 50).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMedicoId(m.id)}
                    className="flex w-full items-center justify-between border-b border-gray-50 px-3 py-2 text-left last:border-0 hover:bg-gray-50"
                  >
                    <span className="text-sm text-gray-900">{m.nombre}</span>
                    <span className="text-xs text-gray-400">{ESTADO_LABEL[m.estado] ?? m.estado}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[#E24B4A]">{error}</div>}
      {resultado && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-[#1D9E75]">{resultado}</div>}

      <button
        onClick={enviar}
        disabled={enviando}
        className="inline-flex items-center gap-2 rounded-lg bg-[#378ADD] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2e6fb5] disabled:opacity-50"
      >
        <Send size={16} />
        {enviando ? "Enviando…" : "Enviar notificación"}
      </button>
    </div>
  );
}
