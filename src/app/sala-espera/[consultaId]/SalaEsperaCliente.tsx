"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { soundConsultaAceptada, soundVideoLista } from "@/lib/sounds";

type Props = {
  consultaId: string;
  estado: string;
  medicoNombre: string;
  precio: number;
  duracion: number;
  especialidad: string;
  posicion: number;
  tiempoEstimado: number;
  isDev?: boolean;
};

function formatPrecio(precio: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(precio);
}

export default function SalaEsperaCliente({
  consultaId,
  estado: estadoInicial,
  medicoNombre,
  precio,
  duracion,
  especialidad,
  posicion: posicionInicial,
  tiempoEstimado: tiempoInicial,
  isDev = false,
}: Props) {
  const [estado, setEstado] = useState(estadoInicial);
  const [posicion, setPosicion] = useState(posicionInicial);
  const [tiempoEstimado, setTiempoEstimado] = useState(tiempoInicial);
  const [salaVideoUrl, setSalaVideoUrl] = useState<string | null>(null);
  const prevEstadoRef = useRef(estadoInicial);

  // Polling cada 3s
  useEffect(() => {
    const supabase = createClient();

    async function poll() {
      const { data } = await supabase
        .from("consultas")
        .select("estado, sala_video_url")
        .eq("id", consultaId)
        .single();
      if (!data) return;

      if ((data.estado === "aceptada" || data.estado === "en_curso") && prevEstadoRef.current === "esperando") {
        soundConsultaAceptada();
        setPosicion(0);
        setTiempoEstimado(0);
      }

      if (data.sala_video_url && !salaVideoUrl) {
        soundVideoLista();
      }

      prevEstadoRef.current = data.estado;
      setEstado(data.estado);
      if (data.sala_video_url) setSalaVideoUrl(data.sala_video_url);
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [consultaId, salaVideoUrl]);

  const aceptada = estado === "aceptada" || estado === "en_curso";

  return (
    <div className="text-center">
      {/* Animación de espera / check */}
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-blue-50">
        {salaVideoUrl ? (
          <span className="text-5xl">📹</span>
        ) : aceptada ? (
          <span className="text-5xl">✅</span>
        ) : (
          <svg
            className="h-12 w-12 animate-spin text-blue-500"
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
        )}
      </div>

      <h1 className="mt-6 text-xl font-bold text-gray-900">
        {salaVideoUrl
          ? "¡El médico inició la videollamada!"
          : aceptada
            ? "¡El médico aceptó tu consulta!"
            : "Estás en la sala de espera"}
      </h1>

      <p className="mt-2 text-sm text-gray-600">
        {salaVideoUrl
          ? "Ya podés unirte a la consulta"
          : aceptada
            ? "Esperando que el médico inicie la videollamada..."
            : `Esperando que el Dr. ${medicoNombre} acepte tu consulta...`}
      </p>

      {/* Info card */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm">
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Médico</span>
            <span className="font-medium text-gray-900">{medicoNombre}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Precio</span>
            <span className="font-medium text-gray-900">
              {formatPrecio(precio)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Duración</span>
            <span className="font-medium text-gray-900">{duracion} min</span>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estado</span>
              <span
                className={`font-medium ${
                  salaVideoUrl
                    ? "text-[#378ADD]"
                    : aceptada
                      ? "text-[#1D9E75]"
                      : "text-[#BA7517]"
                }`}
              >
                {salaVideoUrl
                  ? "Videollamada lista"
                  : aceptada
                    ? "Aceptada"
                    : "Esperando"}
              </span>
            </div>
          </div>

          {!aceptada && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Posición en la cola</span>
                <span className="font-medium text-gray-900">{posicion}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tiempo estimado</span>
                <span className="font-medium text-gray-900">
                  ~{tiempoEstimado} min
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Botón para unirse a la videollamada */}
      {salaVideoUrl && (
        <a
          href={`/consulta/${consultaId}/video`}
          className="mt-6 block w-full rounded-xl bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 active:opacity-80 transition-all duration-100"
        >
          Unirse a la videollamada
        </a>
      )}

      <p className="mt-6 text-xs text-gray-400">
        No cierres esta pestaña
      </p>
    </div>
  );
}
