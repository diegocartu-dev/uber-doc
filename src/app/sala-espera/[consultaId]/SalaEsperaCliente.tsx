"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  consultaId: string;
  estado: string;
  medicoNombre: string;
  precio: number;
  duracion: number;
  especialidad: string;
  posicion: number;
  tiempoEstimado: number;
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
}: Props) {
  const [estado, setEstado] = useState(estadoInicial);
  const [posicion, setPosicion] = useState(posicionInicial);
  const [tiempoEstimado, setTiempoEstimado] = useState(tiempoInicial);
  const [pagando, setPagando] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);

  // Suscripción en tiempo real a cambios de la consulta
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`consulta-${consultaId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "consultas",
          filter: `id=eq.${consultaId}`,
        },
        (payload) => {
          const nuevoEstado = payload.new.estado as string;
          setEstado(nuevoEstado);
          if (nuevoEstado === "aceptada") {
            setPosicion(0);
            setTiempoEstimado(0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [consultaId]);

  const aceptada = estado === "aceptada" || estado === "en_curso";

  return (
    <div className="text-center">
      {/* Animación de espera / check */}
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-blue-50">
        {aceptada ? (
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
        {aceptada
          ? "¡El médico aceptó tu consulta!"
          : "Estás en la sala de espera"}
      </h1>

      <p className="mt-2 text-sm text-gray-600">
        {aceptada
          ? especialidad
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
                  aceptada ? "text-green-600" : "text-yellow-600"
                }`}
              >
                {aceptada ? "Aceptada" : "Esperando"}
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

      {/* Botón de pago */}
      {errorPago && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {errorPago}
        </div>
      )}

      <button
        disabled={!aceptada || pagando}
        onClick={async () => {
          setPagando(true);
          setErrorPago(null);
          try {
            const res = await fetch("/api/pago", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ consultaId }),
            });
            const data = await res.json();
            if (data.init_point) {
              window.location.href = data.init_point;
            } else {
              setErrorPago(data.error || "Error al crear el pago.");
              setPagando(false);
            }
          } catch {
            setErrorPago("Error de conexión. Intentá de nuevo.");
            setPagando(false);
          }
        }}
        className="mt-6 w-full rounded-xl bg-[#009ee3] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#007eb5] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
      >
        {pagando
          ? "Redirigiendo a Mercado Pago..."
          : aceptada
            ? "Pagar con Mercado Pago"
            : "Esperando aceptación del médico..."}
      </button>

      {!aceptada && (
        <p className="mt-3 text-xs text-gray-400">
          El botón de pago se habilitará cuando el médico acepte tu consulta.
        </p>
      )}

      {aceptada && !pagando && (
        <p className="mt-3 text-xs text-green-600">
          Tu consulta fue aceptada. Procedé al pago para iniciar la
          videollamada.
        </p>
      )}
    </div>
  );
}
