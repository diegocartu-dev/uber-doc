"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cancelarTurnoPaciente } from "./actions";
import { capitalizarNombre } from "@/lib/utils/texto";

type Turno = {
  id: string;
  fecha: string;
  hora_inicio: string;
  estado: string;
  especialidad: string;
  medico_nombre: string;
};

export default function MisTurnosPaciente({ turnos: turnosIniciales }: { turnos: Turno[] }) {
  const [turnos, setTurnos] = useState(turnosIniciales);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const hoyStr = `${ahora.getFullYear()}-${(ahora.getMonth() + 1).toString().padStart(2, "0")}-${ahora.getDate().toString().padStart(2, "0")}`;

  const turnosHoy = turnos.filter((t) => t.fecha === hoyStr);
  const turnosProximos = turnos.filter((t) => t.fecha > hoyStr);

  function handleCancelar(turnoId: string) {
    if (!confirm("¿Cancelar este turno?")) return;
    setCancelando(turnoId);
    startTransition(async () => {
      const res = await cancelarTurnoPaciente(turnoId);
      if (!res.error) {
        setTurnos((prev) => prev.filter((t) => t.id !== turnoId));
      }
      setCancelando(null);
    });
  }

  function renderTurno(t: Turno) {
    const [h, m] = t.hora_inicio.split(":").map(Number);
    const minTurno = h * 60 + m;
    const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
    const esHoy = t.fecha === hoyStr;
    const dentroDeRango = esHoy && minTurno - minAhora <= 15 && minTurno - minAhora >= -30;
    const mostrarSala = dentroDeRango || t.estado === "en_espera";

    return (
      <div
        key={t.id}
        className="flex items-center justify-between rounded-lg p-3"
        style={{
          border: mostrarSala ? "0.5px solid #1D9E75" : "0.5px solid #e5e7eb",
          background: mostrarSala ? "#f0fdf4" : undefined,
        }}
      >
        <div>
          <p className="text-base text-gray-900">
            {esHoy
              ? `Hoy · ${t.hora_inicio.slice(0, 5)}`
              : `${new Date(t.fecha + "T12:00:00").toLocaleDateString("es-AR", {
                  weekday: "short", day: "2-digit", month: "short",
                  timeZone: "America/Argentina/Buenos_Aires",
                })} · ${t.hora_inicio.slice(0, 5)}`}
          </p>
          <p className="mt-0.5 text-sm text-gray-500">Dr. {capitalizarNombre(t.medico_nombre)} · {t.especialidad}</p>
        </div>
        <div className="flex items-center gap-2">
          {mostrarSala ? (
            <Link
              href={`/turno/${t.id}/espera`}
              className="shrink-0 rounded-lg bg-[#1D9E75] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#178a64] active:scale-95 transition-all duration-100"
            >
              Ir a sala de espera
            </Link>
          ) : (
            <>
              <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "#F1EFE8", color: "#5F5E5A" }}>
                Confirmado
              </span>
              {t.estado === "confirmado" && (
                <button
                  onClick={() => handleCancelar(t.id)}
                  disabled={cancelando === t.id}
                  className="text-xs text-gray-400 hover:text-[#E24B4A] disabled:opacity-50 transition-colors"
                >
                  {cancelando === t.id ? "..." : "Cancelar"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  if (turnos.length === 0) return null;

  return (
    <div className="rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
      {turnosHoy.length > 0 && (
        <>
          <p className="text-xs font-medium tracking-wide text-gray-400">HOY</p>
          <div className="mt-2 space-y-2">{turnosHoy.map(renderTurno)}</div>
        </>
      )}
      {turnosProximos.length > 0 && (
        <div className={turnosHoy.length > 0 ? "mt-5" : ""}>
          <p className="text-xs font-medium tracking-wide text-gray-400">PRÓXIMOS</p>
          <div className="mt-2 space-y-2">{turnosProximos.map(renderTurno)}</div>
        </div>
      )}
      <a
        href="/paciente/historial"
        className="mt-4 block text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        Ver consultas anteriores
      </a>
    </div>
  );
}
