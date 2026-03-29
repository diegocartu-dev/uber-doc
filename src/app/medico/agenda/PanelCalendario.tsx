"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CalendarioAgendaMedico from "./CalendarioAgendaMedico";

type TurnoResumen = { fecha: string; estado: string };

const DIAS_SEMANA = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function getLunes(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function fechaStr(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

export default function PanelCalendario({ medicoId, precio }: { medicoId: string; precio: number }) {
  const hoy = new Date();
  const hoyStr = fechaStr(hoy);

  // ESTADO ÚNICO: el lunes de la semana seleccionada
  const [lunesActual, setLunesActual] = useState(() => getLunes(hoy));

  // El mes se DERIVA siempre del lunes actual — sin estado propio
  const mesVisible = lunesActual.getMonth();
  const anioVisible = lunesActual.getFullYear();

  // Flechas del semanal
  function semanaAnterior() {
    setLunesActual((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function semanaSiguiente() {
    setLunesActual((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }

  // Flechas del mensual — saltan a una semana que está claramente en el mes objetivo
  function mesAnterior() {
    // Día 15 del mes anterior garantiza que getLunes quede en ese mes
    setLunesActual(getLunes(new Date(anioVisible, mesVisible - 1, 15)));
  }

  function mesSiguiente() {
    setLunesActual(getLunes(new Date(anioVisible, mesVisible + 1, 15)));
  }

  // Click en día del mensual
  function handleDiaClick(fecha: string) {
    setLunesActual(getLunes(new Date(fecha + "T12:00:00")));
  }

  // Botón Hoy
  function handleHoy() {
    setLunesActual(getLunes(hoy));
  }

  // Semana offset para CalendarioAgendaMedico
  const lunesHoy = getLunes(hoy);
  const semanaOffset = Math.round((lunesActual.getTime() - lunesHoy.getTime()) / (7 * 24 * 60 * 60 * 1000));

  function handleSemanaChange(offset: number) {
    const d = new Date(lunesHoy);
    d.setDate(d.getDate() + offset * 7);
    setLunesActual(d);
  }

  // Días de la semana actual para highlight
  const semanaActualDias = new Set(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lunesActual);
      d.setDate(d.getDate() + i);
      return fechaStr(d);
    })
  );

  // Fetch turno summaries
  const [turnosResumen, setTurnosResumen] = useState<TurnoResumen[]>([]);
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const primerDia = `${anioVisible}-${(mesVisible + 1).toString().padStart(2, "0")}-01`;
      const ultimoDia = `${anioVisible}-${(mesVisible + 1).toString().padStart(2, "0")}-${new Date(anioVisible, mesVisible + 1, 0).getDate()}`;
      const { data } = await supabase
        .from("turnos")
        .select("fecha, estado")
        .eq("medico_id", medicoId)
        .gte("fecha", primerDia)
        .lte("fecha", ultimoDia)
        .in("estado", ["disponible", "reservado"]);
      setTurnosResumen(data ?? []);
    }
    load();
  }, [medicoId, mesVisible, anioVisible]);

  const diasConDisponible = new Set<string>();
  const diasConReservado = new Set<string>();
  for (const t of turnosResumen) {
    if (t.estado === "disponible") diasConDisponible.add(t.fecha);
    if (t.estado === "reservado") diasConReservado.add(t.fecha);
  }

  const primerDia = new Date(anioVisible, mesVisible, 1);
  const ultimoDia = new Date(anioVisible, mesVisible + 1, 0);
  const startPad = primerDia.getDay() === 0 ? 6 : primerDia.getDay() - 1;
  const totalDias = ultimoDia.getDate();

  return (
    <div className="space-y-4">
      {/* Mini calendario mensual */}
      <div className="rounded-xl bg-white p-4" style={{ border: "0.5px solid #e5e7eb" }}>
        <div className="flex items-center justify-between">
          <button onClick={mesAnterior} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">←</button>
          <p className="text-xs font-medium text-gray-700">{MESES[mesVisible]} {anioVisible}</p>
          <button onClick={mesSiguiente} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">→</button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-0.5">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="text-center text-[9px] font-medium text-gray-500">{d}</div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-0.5">
          {Array.from({ length: startPad }).map((_, i) => <div key={`p-${i}`} className="h-7" />)}
          {Array.from({ length: totalDias }).map((_, i) => {
            const dia = i + 1;
            const fecha = `${anioVisible}-${(mesVisible + 1).toString().padStart(2, "0")}-${dia.toString().padStart(2, "0")}`;
            const esHoy = fecha === hoyStr;
            const enSemana = semanaActualDias.has(fecha);
            const tieneDisp = diasConDisponible.has(fecha);
            const tieneRes = diasConReservado.has(fecha);

            return (
              <button
                key={dia}
                onClick={() => handleDiaClick(fecha)}
                className={`relative flex h-7 items-center justify-center rounded text-[11px] transition-all duration-100 cursor-pointer ${
                  esHoy ? "bg-[#1D9E75] text-white font-medium rounded-full"
                    : (tieneDisp || tieneRes) ? "text-gray-800 hover:bg-gray-100"
                    : "text-gray-400 hover:bg-gray-50"
                } ${enSemana && !esHoy ? "font-medium" : ""}`}
                style={enSemana && !esHoy ? { background: "#f0fdf4" } : undefined}
              >
                {dia}
                {(tieneDisp || tieneRes) && (
                  <span className="absolute bottom-0.5 flex gap-0.5">
                    {tieneDisp && <span className="inline-block h-1 w-1 rounded-full bg-[#1D9E75]" />}
                    {tieneRes && <span className="inline-block h-1 w-1 rounded-full bg-[#378ADD]" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Calendario semanal */}
      <CalendarioAgendaMedico
        medicoId={medicoId}
        precio={precio}
        semanaOffset={semanaOffset}
        onSemanaChange={handleSemanaChange}
        onHoy={handleHoy}
      />
    </div>
  );
}
