"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cancelarTurnoPaciente } from "./actions";
import { formatNombreMedico } from "@/lib/utils/texto";

type Turno = {
  id: string;
  fecha: string;
  hora_inicio: string;
  estado: string;
  especialidad: string;
  medico_nombre: string;
  monto?: number | null;
};

function esMasDe48h(fecha: string, horaInicio: string): boolean {
  const turnoDate = new Date(`${fecha}T${horaInicio}:00-03:00`);
  return turnoDate.getTime() - Date.now() > 48 * 60 * 60 * 1000;
}

export default function MisTurnosPaciente({ turnos: turnosIniciales }: { turnos: Turno[] }) {
  const [turnos, setTurnos] = useState(turnosIniciales);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [dialogTurno, setDialogTurno] = useState<Turno | null>(null);
  const [motivo, setMotivo] = useState("");
  const [resultado, setResultado] = useState<{ reembolso?: boolean; mensaje?: string } | null>(null);
  const [, startTransition] = useTransition();

  const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const hoyStr = `${ahora.getFullYear()}-${(ahora.getMonth() + 1).toString().padStart(2, "0")}-${ahora.getDate().toString().padStart(2, "0")}`;

  const turnosActivos = turnos.filter((t) => t.estado === "confirmado" || t.estado === "en_espera");
  const turnosHoy = turnosActivos.filter((t) => t.fecha === hoyStr);
  const turnosProximos = turnosActivos.filter((t) => t.fecha > hoyStr);

  function abrirDialogCancelar(turno: Turno) {
    setDialogTurno(turno);
    setMotivo("");
    setResultado(null);
  }

  function confirmarCancelacion() {
    if (!dialogTurno) return;
    const turnoId = dialogTurno.id;
    setCancelando(turnoId);
    startTransition(async () => {
      const res = await cancelarTurnoPaciente(turnoId, motivo || undefined);
      if (!res.error) {
        setTurnos((prev) => prev.filter((t) => t.id !== turnoId));
        setResultado({
          reembolso: res.reembolso,
          mensaje: res.reembolso
            ? "Tu turno fue cancelado y el reembolso fue procesado."
            : "Tu turno fue cancelado. No aplica reembolso por ser menos de 48hs de anticipación.",
        });
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
          border: mostrarSala ? "0.5px solid #378ADD" : "0.5px solid #e5e7eb",
          background: mostrarSala ? "#eff6ff" : undefined,
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
          <p className="mt-0.5 text-sm text-gray-500">{formatNombreMedico(t.medico_nombre)} · {t.especialidad}</p>
        </div>
        <div className="flex items-center gap-2">
          {mostrarSala ? (
            <Link
              href={`/turno/${t.id}/espera`}
              className="shrink-0 rounded-lg bg-[#378ADD] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#2e6fb5] active:scale-95 transition-all duration-100"
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
                  onClick={() => abrirDialogCancelar(t)}
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

  const conReembolso = dialogTurno ? esMasDe48h(dialogTurno.fecha, dialogTurno.hora_inicio) : false;

  return (
    <>
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

      {/* Dialog de cancelación */}
      {dialogTurno && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
          style={{ zIndex: 9999 }}
          onClick={() => !cancelando && !resultado && setDialogTurno(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {resultado ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{resultado.reembolso ? "✓" : "ℹ"}</span>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Turno cancelado
                  </h3>
                </div>
                <p className="text-sm text-gray-600 mb-5">{resultado.mensaje}</p>
                <button
                  onClick={() => setDialogTurno(null)}
                  className="w-full rounded-lg bg-[#378ADD] py-3 text-sm font-medium text-white hover:bg-[#2e6fb5] active:scale-[0.98] transition-all min-h-[48px]"
                >
                  Entendido
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  ¿Cancelar este turno?
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {conReembolso
                    ? `Cancelás tu turno con el ${formatNombreMedico(dialogTurno.medico_nombre)} del ${new Date(dialogTurno.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" })}. Te enviaremos un email con las opciones disponibles.`
                    : `Cancelás tu turno con el ${formatNombreMedico(dialogTurno.medico_nombre)} del ${new Date(dialogTurno.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" })}. Por nuestra política, no aplica reembolso en cancelaciones con menos de 48hs de anticipación.`}
                </p>

                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo de cancelación (opcional)"
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#378ADD] focus:outline-none mb-4 resize-none"
                />

                <div className="flex gap-3">
                  <button
                    onClick={() => setDialogTurno(null)}
                    disabled={!!cancelando}
                    className="flex-1 rounded-lg border border-gray-200 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all min-h-[48px]"
                  >
                    Volver
                  </button>
                  <button
                    onClick={confirmarCancelacion}
                    disabled={!!cancelando}
                    className="flex-1 rounded-lg py-3 text-sm font-medium text-white active:scale-[0.98] transition-all min-h-[48px] disabled:opacity-60"
                    style={{ background: "#E24B4A", border: "1px solid #E24B4A" }}
                  >
                    {cancelando ? "Cancelando..." : "Confirmar cancelación"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
