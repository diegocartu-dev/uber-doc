"use client";

import { useState, useTransition } from "react";
import { reservarTurno, limpiarReservasExpiradas } from "./actions";
import { useEffect } from "react";

type Turno = { id: string; fecha: string; hora_inicio: string; hora_fin: string; monto: number };
type Medico = { id: string; nombre: string; especialidad: string; duracion: number; precio: number };

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function formatFechaLarga(fecha: string) {
  const d = new Date(fecha + "T12:00:00");
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export default function CalendarioTurnos({ turnos, medico }: { turnos: Turno[]; medico: Medico }) {
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<Turno | null>(null);
  const [cuando, setCuando] = useState<string[]>(["24h", "1h", "15m"]);
  const [canal, setCanal] = useState("ambos");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);

  // Limpiar reservas expiradas al cargar
  useEffect(() => { limpiarReservasExpiradas(); }, []);

  // Filtrar turnos pasados y con menos de 1h de anticipación
  const ahora = new Date();
  const hoyStr = ahora.toISOString().split("T")[0];
  const enUnaHora = ahora.getHours() * 60 + ahora.getMinutes() + 60;

  const turnosFiltrados = turnos.filter((t) => {
    if (t.fecha > hoyStr) return true;
    if (t.fecha < hoyStr) return false;
    // Es hoy — verificar hora
    const [h, m] = t.hora_inicio.split(":").map(Number);
    return h * 60 + m >= enUnaHora;
  });

  // Agrupar turnos por fecha
  const turnosPorFecha = new Map<string, Turno[]>();
  for (const t of turnosFiltrados) {
    if (!turnosPorFecha.has(t.fecha)) turnosPorFecha.set(t.fecha, []);
    turnosPorFecha.get(t.fecha)!.push(t);
  }

  // Calendario
  const primerDia = new Date(anio, mes, 1);
  const ultimoDia = new Date(anio, mes + 1, 0);
  const startPad = primerDia.getDay();
  const totalDias = ultimoDia.getDate();

  function prevMes() {
    if (mes === 0) { setMes(11); setAnio(anio - 1); }
    else setMes(mes - 1);
    setDiaSeleccionado(null);
    setTurnoSeleccionado(null);
  }

  function nextMes() {
    if (mes === 11) { setMes(0); setAnio(anio + 1); }
    else setMes(mes + 1);
    setDiaSeleccionado(null);
    setTurnoSeleccionado(null);
  }

  function handleConfirmar() {
    if (!turnoSeleccionado) return;
    setError(null);
    startTransition(async () => {
      const result = await reservarTurno(turnoSeleccionado.id, { cuando: cuando.join(","), canal });
      if (result?.error) { setError(result.error); return; }
      // Redirect a página de pago con contador de 5 min
      window.location.href = `/turno/${turnoSeleccionado.id}/pago`;
    });
  }

  // Turnos del día seleccionado
  const turnosDelDia = diaSeleccionado ? (turnosPorFecha.get(diaSeleccionado) ?? []) : [];
  const turnosManana = turnosDelDia.filter((t) => t.hora_inicio < "13:00");
  const turnosTarde = turnosDelDia.filter((t) => t.hora_inicio >= "13:00");

  if (exito) {
    return (
      <div className="mt-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1D9E75]/10">
          <span className="text-3xl">✅</span>
        </div>
        <h2 className="mt-4 text-lg font-medium text-gray-900">¡Turno confirmado!</h2>
        <p className="mt-2 text-sm text-gray-500">
          {formatFechaLarga(turnoSeleccionado!.fecha)} a las {turnoSeleccionado!.hora_inicio.slice(0, 5)}
        </p>
        <p className="mt-1 text-sm text-gray-500">Dr. {medico.nombre} · {medico.especialidad}</p>
        <a href="/dashboard" className="mt-6 inline-block rounded-lg bg-[#1D9E75] px-6 py-2.5 text-sm font-medium text-white">
          Volver al inicio
        </a>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* Calendario */}
      <div className="rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
        {/* Header mes */}
        <div className="flex items-center justify-between">
          <button onClick={prevMes} className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100">←</button>
          <p className="text-sm font-medium text-gray-900">{MESES[mes]} {anio}</p>
          <button onClick={nextMes} className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100">→</button>
        </div>

        {/* Días de la semana */}
        <div className="mt-4 grid grid-cols-7 gap-1">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-gray-400">{d}</div>
          ))}
        </div>

        {/* Días del mes */}
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {Array.from({ length: totalDias }).map((_, i) => {
            const dia = i + 1;
            const fecha = `${anio}-${(mes + 1).toString().padStart(2, "0")}-${dia.toString().padStart(2, "0")}`;
            const tieneTurnos = turnosPorFecha.has(fecha);
            const esHoy = fecha === hoy.toISOString().split("T")[0];
            const seleccionado = diaSeleccionado === fecha;

            return (
              <button
                key={dia}
                disabled={!tieneTurnos}
                onClick={() => { setDiaSeleccionado(fecha); setTurnoSeleccionado(null); }}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs transition-all duration-100 ${
                  seleccionado
                    ? "bg-[#1D9E75] text-white font-medium"
                    : tieneTurnos
                      ? "bg-[#1D9E75]/10 text-[#1D9E75] font-medium hover:bg-[#1D9E75]/20"
                      : "text-gray-300 cursor-default"
                } ${esHoy && !seleccionado ? "ring-1 ring-[#1D9E75]" : ""}`}
              >
                {dia}
              </button>
            );
          })}
        </div>
      </div>

      {/* Horarios disponibles */}
      {diaSeleccionado && !turnoSeleccionado && (
        <div className="mt-4 rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
          <p className="text-xs font-medium text-gray-400">{formatFechaLarga(diaSeleccionado).toUpperCase()}</p>

          {turnosManana.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-gray-400">MAÑANA</p>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {turnosManana.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTurnoSeleccionado(t)}
                    className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-[#1D9E75]/10 hover:text-[#1D9E75] active:scale-95 transition-all duration-100"
                    style={{ border: "0.5px solid #e5e7eb" }}
                  >
                    {t.hora_inicio.slice(0, 5)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turnosManana.length > 0 && turnosTarde.length > 0 && (
            <div className="my-3" style={{ borderTop: "0.5px solid #e5e7eb" }} />
          )}

          {turnosTarde.length > 0 && (
            <div className={turnosManana.length === 0 ? "mt-3" : ""}>
              <p className="text-[10px] text-gray-400">TARDE</p>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {turnosTarde.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTurnoSeleccionado(t)}
                    className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-[#1D9E75]/10 hover:text-[#1D9E75] active:scale-95 transition-all duration-100"
                    style={{ border: "0.5px solid #e5e7eb" }}
                  >
                    {t.hora_inicio.slice(0, 5)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmación */}
      {turnoSeleccionado && (
        <div className="mt-4 rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
          <p className="text-xs font-medium tracking-wide text-gray-400">CONFIRMAR TURNO</p>

          <div className="mt-3 space-y-2 text-sm">
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
              <span className="text-gray-900">{formatFechaLarga(turnoSeleccionado.fecha)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Horario</span>
              <span className="text-gray-900">{turnoSeleccionado.hora_inicio.slice(0, 5)} — {turnoSeleccionado.hora_fin.slice(0, 5)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Duración</span>
              <span className="text-gray-900">{medico.duracion} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Valor</span>
              <span className="font-medium text-gray-900">${(turnoSeleccionado.monto ?? medico.precio).toLocaleString("es-AR")}</span>
            </div>
          </div>

          {/* Recordatorios — multiselección */}
          <div className="mt-4" style={{ borderTop: "0.5px solid #e5e7eb", paddingTop: "12px" }}>
            <p className="text-xs text-gray-400">Recordatorios</p>
            <div className="mt-2 flex gap-2">
              {(() => {
                const todosActivos = cuando.length === 3 && ["24h", "1h", "15m"].every((v) => cuando.includes(v));
                const toggleRecordatorio = (value: string) => {
                  if (value === "todos") {
                    setCuando(todosActivos ? [] : ["24h", "1h", "15m"]);
                  } else {
                    setCuando((prev) =>
                      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
                    );
                  }
                };
                return [
                  { value: "todos", label: "Todos", activo: todosActivos },
                  { value: "24h", label: "24hs", activo: cuando.includes("24h") },
                  { value: "1h", label: "1 hora", activo: cuando.includes("1h") },
                  { value: "15m", label: "15 min", activo: cuando.includes("15m") },
                ].map((r) => (
                <button
                  key={r.value}
                  onClick={() => toggleRecordatorio(r.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all duration-100 ${
                    r.activo
                      ? "bg-[#1D9E75] text-white"
                      : "bg-gray-50 text-gray-500"
                  }`}
                  style={{ border: r.activo ? "none" : "0.5px solid #e5e7eb" }}
                >
                  {r.label}
                </button>
              ));
              })()}
            </div>
          </div>

          <div className="mt-3">
            <p className="text-xs text-gray-400">Canal</p>
            <div className="mt-2 flex gap-2">
              {[
                { value: "ambos", label: "Ambos" },
                { value: "email", label: "Email" },
                { value: "whatsapp", label: "WhatsApp" },
              ].map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCanal(c.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all duration-100 ${
                    canal === c.value
                      ? "bg-[#1D9E75] text-white"
                      : "bg-gray-50 text-gray-500"
                  }`}
                  style={{ border: canal === c.value ? "none" : "0.5px solid #e5e7eb" }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-600">{error}</div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              onClick={() => setTurnoSeleccionado(null)}
              className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-200"
            >
              Volver
            </button>
            <button
              onClick={() => setMostrarConfirmacion(true)}
              className="flex-1 rounded-lg bg-[#1D9E75] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#178a64] active:scale-95 transition-all duration-100"
            >
              Confirmar turno →
            </button>
          </div>
        </div>
      )}

      {/* Modal de confirmación */}
      {mostrarConfirmacion && turnoSeleccionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-sm font-medium text-gray-900">Confirmá tu turno</p>

            <div className="mt-4 space-y-1.5 text-sm">
              <p className="text-gray-700">{formatFechaLarga(turnoSeleccionado.fecha)} · {turnoSeleccionado.hora_inicio.slice(0, 5)} hs</p>
              <p className="text-gray-700">Dr. {medico.nombre}</p>
              <p className="font-medium text-gray-900">${(turnoSeleccionado.monto ?? medico.precio).toLocaleString("es-AR")}</p>
            </div>

            <div className="mt-4 rounded-lg bg-gray-50 p-3" style={{ border: "0.5px solid #e5e7eb" }}>
              <p className="text-xs font-medium text-gray-500">ℹ️ Condiciones:</p>
              <ul className="mt-1.5 space-y-1 text-[11px] text-gray-500">
                <li>· Cancelación sin costo hasta 48 hs antes</li>
                <li>· Si el profesional cancela, se reintegra el 100% del monto</li>
              </ul>
            </div>

            {error && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-600">{error}</div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => { setMostrarConfirmacion(false); setError(null); }}
                className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={isPending}
                className="flex-1 rounded-lg bg-[#1D9E75] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#178a64] disabled:opacity-50 active:scale-95 transition-all duration-100"
              >
                {isPending ? "Confirmando..." : "Confirmar y pagar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
