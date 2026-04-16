"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { soundConsultaAceptada, soundVideoLista } from "@/lib/sounds";
import { Video, CheckCircle } from "lucide-react";

const POLL_INTERVAL = 5000;

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
  const [pagando, setPagando] = useState(false);
  const [salaVideoUrl, setSalaVideoUrl] = useState<string | null>(null);
  const prevEstadoRef = useRef(estadoInicial);
  const salaVideoUrlRef = useRef<string | null>(null);

  // Polling: 5s interval contra /api/consulta-estado
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/consulta-estado?consultaId=${consultaId}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json() as { estado: string; sala_video_url: string | null };

      if (
        (data.estado === "aceptada" || data.estado === "pagada" || data.estado === "en_curso") &&
        prevEstadoRef.current === "esperando"
      ) {
        soundConsultaAceptada();
        setPosicion(0);
        setTiempoEstimado(0);
      }
      if (data.sala_video_url && !salaVideoUrlRef.current) {
        soundVideoLista();
      }
      prevEstadoRef.current = data.estado;
      setEstado(data.estado);
      if (data.sala_video_url) {
        salaVideoUrlRef.current = data.sala_video_url;
        setSalaVideoUrl(data.sala_video_url);
      }
    } catch {
      // red error — próximo ciclo reintenta
    }
  }, [consultaId]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [poll]);

  const aceptada = estado === "aceptada" || estado === "pagada" || estado === "en_curso";

  return (
    <div className="text-center">
      {/* Animación de espera / check */}
      <div
        className="mx-auto flex h-24 w-24 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--color-primary-soft)" }}
      >
        {salaVideoUrl ? (
          <Video size={40} strokeWidth={1.75} style={{ color: "var(--color-info)" }} />
        ) : aceptada ? (
          <CheckCircle size={40} strokeWidth={1.75} style={{ color: "var(--color-success)" }} />
        ) : (
          <svg
            className="h-12 w-12 animate-spin"
            style={{ color: "var(--color-primary)" }}
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
          className="mt-6 block w-full rounded-[var(--radius-lg)] px-6 py-3 text-center text-sm font-semibold text-white shadow-sm active:scale-[0.97] transition-all duration-100"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          Unirse a la videollamada
        </a>
      )}

      {/* Botón de testing — simular pago aprobado */}
      {aceptada && !salaVideoUrl && estado !== "pagada" && estado !== "en_curso" && (
        <button
          disabled={pagando}
          onClick={async () => {
            setPagando(true);
            const res = await fetch("/api/pago/simular", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ consultaId }),
            });
            if (res.ok) {
              window.location.href = `/consulta/${consultaId}/info-medica?redirect=/consulta/${consultaId}/confirmacion`;
            } else {
              setPagando(false);
            }
          }}
          className="mt-4 w-full rounded-xl bg-[#378ADD] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#2e6fb5] disabled:opacity-50"
        >
          Simular pago aprobado
        </button>
      )}

      <p className="mt-6 text-xs text-gray-400">
        No cierres esta pestaña
      </p>
    </div>
  );
}
