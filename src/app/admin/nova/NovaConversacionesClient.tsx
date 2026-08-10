"use client";

// Lectura de las conversaciones con Nova, orientada a UNA pregunta:
// ¿qué le están pidiendo los profesionales que la app todavía no hace?
//
// Por eso la vista por defecto es "solo los pedidos": las respuestas de Nova las
// escribimos nosotros, no aportan a esa pregunta y triplican el texto a leer.
// El hilo completo está a un click, para cuando un pedido necesita contexto.

import { useMemo, useState } from "react";
import type { ConversacionNova } from "./page";

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NovaConversacionesClient({
  conversaciones,
}: {
  conversaciones: ConversacionNova[];
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [soloPedidos, setSoloPedidos] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return conversaciones;
    return conversaciones.filter(
      (c) =>
        c.medico.toLowerCase().includes(q) ||
        c.mensajes.some((m) => m.contenido.toLowerCase().includes(q))
    );
  }, [conversaciones, busqueda]);

  const totales = useMemo(() => {
    const pedidos = conversaciones.reduce(
      (s, c) => s + c.mensajes.filter((m) => m.rol === "medico").length,
      0
    );
    const acciones = conversaciones.reduce(
      (s, c) => s + c.mensajes.filter((m) => m.herramienta).length,
      0
    );
    const profesionales = new Set(conversaciones.map((c) => c.medico)).size;
    return { pedidos, acciones, profesionales };
  }, [conversaciones]);

  if (conversaciones.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-900">Qué le piden a Nova</h1>
        <p className="mt-3 max-w-xl text-sm text-gray-600">
          Todavía no hay conversaciones guardadas. El guardado empieza a correr con el próximo
          mensaje que un profesional le escriba a Nova — lo anterior no se puede recuperar, porque
          nunca se guardó.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900">Qué le piden a Nova</h1>
      <p className="mt-1 text-sm text-gray-500">
        {totales.pedidos} {totales.pedidos === 1 ? "pedido" : "pedidos"} de{" "}
        {totales.profesionales}{" "}
        {totales.profesionales === 1 ? "profesional" : "profesionales"} ·{" "}
        {totales.acciones} {totales.acciones === 1 ? "acción ejecutada" : "acciones ejecutadas"}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en los pedidos…"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={soloPedidos}
            onChange={(e) => setSoloPedidos(e.target.checked)}
          />
          Solo lo que pidió el profesional
        </label>
      </div>

      <div className="mt-5 space-y-3">
        {filtradas.map((c) => {
          const visibles = soloPedidos ? c.mensajes.filter((m) => m.rol === "medico") : c.mensajes;
          const acciones = c.mensajes.filter((m) => m.herramienta);
          const expandida = abierta === c.id;

          return (
            <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{c.medico}</span>
                <span className="text-xs text-gray-400">{fechaCorta(c.iniciada_at)}</span>
              </div>

              {acciones.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...new Set(acciones.map((a) => a.herramienta))].map((h) => (
                    <span
                      key={h}
                      className="rounded-full bg-[#1D9E75]/10 px-2 py-0.5 text-xs font-medium text-[#1D9E75]"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 space-y-2">
                {(expandida ? visibles : visibles.slice(0, 2)).map((m) => (
                  <p
                    key={m.id}
                    className={
                      m.rol === "medico"
                        ? "whitespace-pre-line text-sm text-gray-800"
                        : "whitespace-pre-line border-l-2 border-gray-200 pl-3 text-sm text-gray-500"
                    }
                  >
                    {m.rol === "nova" && (
                      <span className="mr-1 text-xs font-medium text-gray-400">Nova:</span>
                    )}
                    {m.contenido}
                  </p>
                ))}
              </div>

              {visibles.length > 2 && (
                <button
                  onClick={() => setAbierta(expandida ? null : c.id)}
                  className="mt-2 text-xs font-medium text-[#378ADD]"
                >
                  {expandida ? "Ver menos" : `Ver los ${visibles.length} mensajes`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {filtradas.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">Ningún pedido coincide con esa búsqueda.</p>
      )}
    </div>
  );
}
