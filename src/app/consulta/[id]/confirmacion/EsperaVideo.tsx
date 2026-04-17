"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// Boton reutilizable "Volver"
function VolverAlInicio({ returnUrl = "/dashboard" }: { returnUrl?: string }) {
  return (
    <div className="mt-4">
      <Link
        href={returnUrl}
        className="block w-full rounded-xl border border-gray-300 px-6 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all duration-300"
      >
        {returnUrl.startsWith("/dr/") ? "Volver al consultorio" : "Volver al inicio"}
      </Link>
    </div>
  );
}

export default function EsperaVideo({
  consultaId,
  salaVideoUrlInicial,
  estadoInicial,
  medicoNombre,
  especialidad,
  duracionConsulta,
  createdAt,
  returnUrl,
}: {
  consultaId: string;
  salaVideoUrlInicial: string | null;
  estadoInicial?: string;
  medicoNombre: string;
  especialidad: string;
  duracionConsulta: number;
  createdAt: string;
  returnUrl?: string;
}) {
  const returnUrlFinal = returnUrl ?? "/dashboard";
  const [salaUrl, setSalaUrl] = useState(salaVideoUrlInicial);
  const [estado, setEstado] = useState<string>(estadoInicial ?? "aceptada");
  const [minutosEspera, setMinutosEspera] = useState(0);

  // Polling: 5s interval contra /api/consulta-estado
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/consulta-estado?consultaId=${consultaId}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json() as { estado: string; sala_video_url: string | null };
      if (data.estado) setEstado(data.estado);
      if (data.sala_video_url) setSalaUrl(data.sala_video_url);
    } catch {
      // red error — próximo ciclo reintenta
    }
  }, [consultaId]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [poll]);

  // Timer de espera para estado pagada
  useEffect(() => {
    if (!createdAt) return;

    function calcular() {
      const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
      setMinutosEspera(Math.max(0, mins));
    }

    calcular();
    const interval = setInterval(calcular, 60000);
    return () => clearInterval(interval);
  }, [createdAt]);

  // ---- ESTADO: cancelada ----
  if (estado === "cancelada") {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-red-50">
          <span className="text-4xl" style={{ color: "#E24B4A" }}>X</span>
        </div>
        <h1 className="mt-6 text-2xl font-bold text-gray-900">Consulta cancelada</h1>
        <p className="mt-2 text-gray-600">La consulta fue cancelada por el medico</p>

        <InfoCard medicoNombre={medicoNombre} especialidad={especialidad} duracionConsulta={duracionConsulta} />

        <div className="mt-6 rounded-xl border px-6 py-4 text-center" style={{ borderColor: "#E24B4A", background: "rgba(226,75,74,0.06)" }}>
          <span className="text-sm font-medium" style={{ color: "#E24B4A" }}>Cancelada</span>
        </div>

        <VolverAlInicio returnUrl={returnUrl} />
      </div>
    );
  }

  // ---- ESTADO: en_curso (medico ya inicio) ----
  if (estado === "en_curso") {
    return (
      <div className="text-center">
        {/* Icono check verde con pulse */}
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#1D9E75] animate-[pulse_2s_ease-in-out_infinite]">
          <span className="text-4xl font-bold text-white">&#10003;</span>
        </div>

        <h1 className="mt-6 text-2xl font-bold text-gray-900">
          El medico te esta esperando!
        </h1>
        <p className="mt-2 text-gray-600">
          Tu consulta con Dr. {medicoNombre} esta lista
        </p>

        <InfoCard medicoNombre={medicoNombre} especialidad={especialidad} duracionConsulta={duracionConsulta}>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estado</span>
              <span className="font-medium" style={{ color: "#1D9E75" }}>En curso</span>
            </div>
          </div>
        </InfoCard>

        {/* Boton ENORME */}
        <a
          href={`/consulta/${consultaId}/sala`}
          className="mt-8 block w-full rounded-xl py-4 px-8 text-center text-lg font-semibold text-white shadow-sm transition-all duration-300 active:scale-95 animate-[softPulse_2s_ease-in-out_infinite]"
          style={{ backgroundColor: "#378ADD", minHeight: "44px" }}
        >
          Entrar a la videollamada
        </a>

        {/* Custom keyframes inline */}
        <style>{`
          @keyframes softPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.9; }
          }
        `}</style>
      </div>
    );
  }

  // ---- ESTADO: pagada (esperando al medico) ----
  if (estado === "pagada") {
    return (
      <div className="text-center">
        {/* Check verde (no emoji) */}
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full" style={{ backgroundColor: "#1D9E75" }}>
          <span className="text-4xl font-bold text-white">&#10003;</span>
        </div>

        <h1 className="mt-6 text-2xl font-bold text-gray-900">Pago confirmado!</h1>
        <p className="mt-2 text-gray-600">
          Estas en la sala de espera. El medico te va a llamar en breve.
        </p>

        <InfoCard medicoNombre={medicoNombre} especialidad={especialidad} duracionConsulta={duracionConsulta}>
          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estado</span>
              <span className="font-medium" style={{ color: "#1D9E75" }}>Pagada</span>
            </div>
          </div>
        </InfoCard>

        {/* Bloque estado espera */}
        <div
          className="mt-6 rounded-xl border px-6 py-5"
          style={{ borderColor: "#1D9E75", background: "#E1F5EE" }}
        >
          <div className="flex items-center justify-center gap-3">
            {/* Spinner CSS */}
            <svg className="h-5 w-5 animate-spin" style={{ color: "#1D9E75" }} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-sm font-medium" style={{ color: "#1D9E75" }}>
              Tiempo de espera: {minutosEspera} min
            </p>
          </div>
        </div>

        <VolverAlInicio returnUrl={returnUrl} />
      </div>
    );
  }

  // ---- ESTADO: aceptada (pre-pago / procesando) ----
  return (
    <div className="text-center">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-orange-50">
        <span className="text-5xl">&#9203;</span>
      </div>
      <h1 className="mt-6 text-2xl font-bold text-gray-900">Procesando pago...</h1>
      <p className="mt-2 text-gray-600">Estamos verificando tu pago con Mercado Pago</p>

      <InfoCard medicoNombre={medicoNombre} especialidad={especialidad} duracionConsulta={duracionConsulta}>
        <div className="border-t border-gray-100 pt-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Estado</span>
            <span className="font-medium" style={{ color: "#BA7517" }}>Pendiente</span>
          </div>
        </div>
      </InfoCard>

      {/* Spinner de espera */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 px-6 py-4">
        <div className="flex items-center justify-center gap-2">
          <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-sm text-gray-500">Esperando confirmacion de pago...</p>
        </div>
      </div>

      <VolverAlInicio />
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfoCard reutilizable
// ---------------------------------------------------------------------------

function InfoCard({
  medicoNombre,
  especialidad,
  duracionConsulta,
  children,
}: {
  medicoNombre: string;
  especialidad: string;
  duracionConsulta: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="space-y-3">
        {medicoNombre && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Medico</span>
            <span className="font-medium text-gray-900">{medicoNombre}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Especialidad</span>
          <span className="font-medium text-gray-900">{especialidad}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Duracion</span>
          <span className="font-medium text-gray-900">{duracionConsulta} min</span>
        </div>
        {children}
      </div>
    </div>
  );
}
