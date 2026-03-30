"use client";

import { useState, useEffect, useTransition } from "react";
import { confirmarPagoTurno, expirarTurno } from "@/app/clinica/[medicoId]/turnos/actions";

type Props = {
  turnoId: string;
  reservadoHasta: string | null;
  medico: { nombre: string; especialidad: string; duracion: number };
  turno: { fecha: string; horaInicio: string; horaFin: string; monto: number };
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function formatFecha(f: string) {
  const d = new Date(f + "T12:00:00");
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export default function PagoPendiente({ turnoId, reservadoHasta, medico, turno }: Props) {
  const [segundosRestantes, setSegundosRestantes] = useState(() => {
    if (!reservadoHasta) return 0;
    return Math.max(0, Math.floor((new Date(reservadoHasta).getTime() - Date.now()) / 1000));
  });
  const [expirado, setExpirado] = useState(segundosRestantes <= 0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pagado, setPagado] = useState(false);

  // Countdown
  useEffect(() => {
    if (expirado) return;
    const interval = setInterval(() => {
      setSegundosRestantes((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Liberar el turno en Supabase via RPC SECURITY DEFINER
          expirarTurno(turnoId).then(() => setExpirado(true));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [expirado, turnoId]);

  function handlePagar() {
    setError(null);
    startTransition(async () => {
      const result = await confirmarPagoTurno(turnoId);
      if (result?.error) { setError(result.error); return; }
      setPagado(true);
      setTimeout(() => { window.location.href = `/turno/${turnoId}/confirmacion`; }, 1500);
    });
  }

  const min = Math.floor(segundosRestantes / 60);
  const sec = segundosRestantes % 60;

  // Pagado
  if (pagado) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1D9E75]/10">
          <span className="text-3xl">✅</span>
        </div>
        <h2 className="mt-4 text-lg font-medium text-gray-900">¡Pago confirmado!</h2>
        <p className="mt-2 text-sm text-gray-500">Redirigiendo...</p>
      </div>
    );
  }

  // Expirado
  if (expirado) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <span className="text-3xl">⏰</span>
        </div>
        <h2 className="mt-4 text-lg font-medium text-gray-900">Tu reserva expiró</h2>
        <p className="mt-2 text-sm text-gray-500">El tiempo para completar el pago se agotó. El turno volvió a estar disponible.</p>
        <a href="/clinica" className="mt-6 inline-block rounded-lg bg-[#1D9E75] px-6 py-2.5 text-sm font-medium text-white">
          Volver al calendario
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* Contador */}
      <div className="text-center">
        <p className="text-xs font-medium tracking-wide text-gray-400">COMPLETÁ TU PAGO</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums" style={{ color: segundosRestantes < 60 ? "#E24B4A" : "#1D9E75" }}>
          {min}:{sec.toString().padStart(2, "0")}
        </p>
        <p className="mt-1 text-xs text-gray-500">Tu turno está reservado por {min > 0 ? `${min} min` : `${sec} seg`}</p>
      </div>

      {/* Detalle del turno */}
      <div className="mt-6 rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Médico</span>
            <span className="font-medium text-gray-900">Dr. {medico.nombre}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Especialidad</span>
            <span className="text-gray-900">{medico.especialidad}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Fecha</span>
            <span className="text-gray-900">{formatFecha(turno.fecha)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Horario</span>
            <span className="text-gray-900">{turno.horaInicio.slice(0, 5)} — {turno.horaFin.slice(0, 5)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Duración</span>
            <span className="text-gray-900">{medico.duracion} min</span>
          </div>
          <div className="border-t pt-2" style={{ borderColor: "#e5e7eb" }}>
            <div className="flex justify-between">
              <span className="text-gray-500">Total</span>
              <span className="text-lg font-semibold text-gray-900">${turno.monto.toLocaleString("es-AR")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {/* Botón pagar */}
      <button
        onClick={handlePagar}
        disabled={isPending}
        className="mt-6 w-full rounded-xl bg-[#1D9E75] px-6 py-3.5 text-sm font-medium text-white hover:bg-[#178a64] disabled:opacity-50 active:scale-95 transition-all duration-100"
      >
        {isPending ? "Procesando..." : "🧪 Simular pago aprobado"}
      </button>

      <p className="mt-3 text-center text-[11px] text-gray-400">
        Podés cancelar sin costo hasta 48 hs antes. Si el profesional cancela, se reintegra el 100% del monto.
      </p>
    </div>
  );
}
