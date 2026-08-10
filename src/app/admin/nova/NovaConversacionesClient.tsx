"use client";

// Las conversaciones con Nova, completas y legibles.
//
// PARA QUÉ (Diego, 10/08/2026): ver qué NO entiende Nova, qué le preguntan dos
// veces, y con eso entrenarla y arreglar la app. Por eso la transcripción va
// completa por defecto: la respuesta de Nova es justamente la mitad que hay que
// evaluar. Filtrarla dejaba afuera el objeto de estudio.
//
// No hay filtro de contenido de ningún tipo. Lo que un profesional le pregunta a
// Nova —incluido el nombre de un paciente que pidió turno— es dato que ya se ve
// en cualquier otra pantalla de /admin, igual que los diagnósticos y las recetas
// emitidas. Poner una capa especial acá sería inventar una distinción que el
// producto no tiene.

import { useMemo, useState } from "react";
import type { ConversacionNova } from "./page";

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export default function NovaConversacionesClient({
  conversaciones,
}: {
  conversaciones: ConversacionNova[];
}) {
  const [profesional, setProfesional] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [soloConAcciones, setSoloConAcciones] = useState(false);

  const profesionales = useMemo(
    () => [...new Set(conversaciones.map((c) => c.medico))].sort((a, b) => a.localeCompare(b, "es")),
    [conversaciones]
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return conversaciones.filter((c) => {
      if (profesional && c.medico !== profesional) return false;
      if (soloConAcciones && !c.mensajes.some((m) => m.herramienta)) return false;
      if (!q) return true;
      return (
        c.medico.toLowerCase().includes(q) ||
        c.mensajes.some((m) => m.contenido.toLowerCase().includes(q))
      );
    });
  }, [conversaciones, profesional, busqueda, soloConAcciones]);

  const totales = useMemo(() => {
    const pedidos = filtradas.reduce(
      (s, c) => s + c.mensajes.filter((m) => m.rol === "medico").length,
      0
    );
    const acciones = filtradas.reduce(
      (s, c) => s + c.mensajes.filter((m) => m.herramienta).length,
      0
    );
    return { pedidos, acciones, profesionales: new Set(filtradas.map((c) => c.medico)).size };
  }, [filtradas]);

  if (conversaciones.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-900">Conversaciones con Nova</h1>
        <p className="mt-3 max-w-xl text-sm text-gray-600">
          Todavía no hay conversaciones guardadas. El registro empieza con el próximo mensaje que un
          profesional le escriba a Nova — lo anterior no se puede recuperar, porque nunca se guardó.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900">Conversaciones con Nova</h1>
      <p className="mt-1 text-sm text-gray-500">
        {filtradas.length} {filtradas.length === 1 ? "conversación" : "conversaciones"} ·{" "}
        {totales.pedidos} {totales.pedidos === 1 ? "pedido" : "pedidos"} ·{" "}
        {totales.profesionales}{" "}
        {totales.profesionales === 1 ? "profesional" : "profesionales"} ·{" "}
        {totales.acciones} {totales.acciones === 1 ? "acción ejecutada" : "acciones ejecutadas"}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          value={profesional}
          onChange={(e) => setProfesional(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Todos los profesionales</option>
          {profesionales.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en las conversaciones…"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />

        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={soloConAcciones}
            onChange={(e) => setSoloConAcciones(e.target.checked)}
          />
          Solo donde Nova ejecutó algo
        </label>
      </div>

      <div className="mt-5 space-y-4">
        {filtradas.map((c) => {
          const acciones = [...new Set(c.mensajes.filter((m) => m.herramienta).map((m) => m.herramienta))];

          return (
            <div key={c.id} className="rounded-xl border border-gray-200 bg-white">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 px-4 py-3">
                <span className="text-sm font-semibold text-gray-900">{c.medico}</span>
                <span className="text-xs text-gray-400">{fechaLarga(c.iniciada_at)}</span>
              </div>

              {acciones.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                  {acciones.map((h) => (
                    <span
                      key={h}
                      className="rounded-full bg-[#1D9E75]/10 px-2 py-0.5 text-xs font-medium text-[#1D9E75]"
                    >
                      Nova ejecutó: {h}
                    </span>
                  ))}
                </div>
              )}

              {/* Transcripción completa, en orden. Sin cortes ni "ver más": el
                  valor está en leer el ida y vuelta entero — dónde Nova no
                  entendió y dónde el profesional tuvo que repetirse. */}
              <div className="space-y-3 px-4 py-4">
                {c.mensajes.map((m) => (
                  <div key={m.id}>
                    <div className="flex items-baseline gap-2">
                      <span
                        className={
                          m.rol === "medico"
                            ? "text-xs font-semibold text-[#378ADD]"
                            : "text-xs font-semibold text-gray-500"
                        }
                      >
                        {m.rol === "medico" ? c.medico : "Nova"}
                      </span>
                      <span className="text-[11px] text-gray-300">{horaCorta(m.created_at)}</span>
                      {m.herramienta && (
                        <span className="text-[11px] font-medium text-[#1D9E75]">
                          → {m.herramienta}
                        </span>
                      )}
                    </div>
                    <p
                      className={
                        m.rol === "medico"
                          ? "mt-0.5 whitespace-pre-line text-sm text-gray-900"
                          : "mt-0.5 whitespace-pre-line border-l-2 border-gray-200 pl-3 text-sm text-gray-600"
                      }
                    >
                      {m.contenido}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {filtradas.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">Nada coincide con ese filtro.</p>
      )}
    </div>
  );
}
