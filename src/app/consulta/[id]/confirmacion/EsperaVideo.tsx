"use client";

import { useEffect, useState } from "react";

export default function EsperaVideo({
  consultaId,
  salaVideoUrlInicial,
  estadoInicial,
  medicoNombre,
  especialidad,
  duracionConsulta,
}: {
  consultaId: string;
  salaVideoUrlInicial: string | null;
  estadoInicial?: string;
  medicoNombre: string;
  especialidad: string;
  duracionConsulta: number;
}) {
  const [salaUrl, setSalaUrl] = useState(salaVideoUrlInicial);
  const [estado, setEstado] = useState<string>(estadoInicial ?? "aceptada");

  // Polling cada 3s
  useEffect(() => {
    if (salaUrl) return;

    async function poll() {
      try {
        const res = await fetch(`/api/consulta-estado?consultaId=${consultaId}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.estado) setEstado(data.estado);
        if (data.sala_video_url) setSalaUrl(data.sala_video_url);
      } catch {
        // silently ignore
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [consultaId, salaUrl]);

  const pagado = estado === "pagada" || estado === "en_curso";

  // Header section — reactiva al estado
  const header = (
    <div className="text-center">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#1D9E75]/5">
        <span className="text-5xl">{estado === "cancelada" ? "❌" : pagado ? "✅" : "⏳"}</span>
      </div>
      <h1 className="mt-6 text-2xl font-bold text-gray-900">
        {estado === "cancelada"
          ? "Consulta cancelada"
          : pagado
            ? "¡Pago confirmado!"
            : "Procesando pago..."}
      </h1>
      <p className="mt-2 text-gray-600">
        {estado === "cancelada"
          ? "La consulta fue cancelada por el médico"
          : pagado
            ? "Tu consulta está lista para comenzar"
            : "Estamos verificando tu pago con Mercado Pago"}
      </p>
    </div>
  );

  // Info card del médico
  const infoCard = (
    <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="space-y-3">
        {medicoNombre && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Médico</span>
            <span className="font-medium text-gray-900">{medicoNombre}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Especialidad</span>
          <span className="font-medium text-gray-900">{especialidad}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Duración</span>
          <span className="font-medium text-gray-900">{duracionConsulta} min</span>
        </div>
        <div className="border-t border-gray-100 pt-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Estado</span>
            <span
              className="font-medium"
              style={{ color: estado === "cancelada" ? "#E24B4A" : pagado ? "#1D9E75" : "#BA7517" }}
            >
              {estado === "cancelada" ? "Cancelada" : pagado ? "Pagada" : "Pendiente"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  // Action section — depende del estado
  let action;

  if (estado === "cancelada") {
    action = (
      <div className="mt-8 rounded-xl border px-6 py-4 text-center" style={{ borderColor: "#E24B4A", background: "rgba(226,75,74,0.06)" }}>
        <p className="text-sm font-medium" style={{ color: "#E24B4A" }}>
          La consulta fue cancelada
        </p>
      </div>
    );
  } else if (salaUrl) {
    action = (
      <a
        href={`/consulta/${consultaId}/video`}
        className="mt-8 block w-full rounded-xl bg-[#1D9E75] px-6 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-[#178a64] active:scale-95 transition-all duration-100"
      >
        Unirse a la videollamada
      </a>
    );
  } else if (estado === "pagada") {
    action = (
      <div className="mt-8 rounded-xl border px-6 py-4 text-center" style={{ borderColor: "#1D9E75", background: "rgba(29,158,117,0.06)" }}>
        <p className="text-sm font-medium" style={{ color: "#1D9E75" }}>
          ✓ Pago confirmado
        </p>
        <p className="mt-1 text-xs text-gray-500">
          El médico iniciará la videollamada en breve
        </p>
      </div>
    );
  } else {
    action = (
      <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 px-6 py-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-sm text-gray-500">Esperando confirmacion de pago...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {header}
      {infoCard}
      {action}
    </>
  );
}
