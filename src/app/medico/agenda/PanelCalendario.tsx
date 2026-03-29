"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CalendarioAgendaMedico from "./CalendarioAgendaMedico";

type TurnoResumen = { fecha: string; estado: string };

const DIAS_SEMANA = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function getLunes(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

export default function PanelCalendario({ medicoId, precio }: { medicoId: string; precio: number }) {
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [turnosResumen, setTurnosResumen] = useState<TurnoResumen[]>([]);

  const hoyStr = hoy.toISOString().split("T")[0];

  // Fetch turno summaries for the visible month
  useEffect(() => {
    async function fetch() {
      const supabase = createClient();
      const primerDia = `${anio}-${(mes + 1).toString().padStart(2, "0")}-01`;
      const ultimoDia = `${anio}-${(mes + 1).toString().padStart(2, "0")}-${new Date(anio, mes + 1, 0).getDate()}`;
      const { data } = await supabase
        .from("turnos")
        .select("fecha, estado")
        .eq("medico_id", medicoId)
        .gte("fecha", primerDia)
        .lte("fecha", ultimoDia)
        .in("estado", ["disponible", "reservado"]);
      setTurnosResumen(data ?? []);
    }
    fetch();
  }, [medicoId, mes, anio]);

  // Index: which days have which states
  const diasConDisponible = new Set<string>();
  const diasConReservado = new Set<string>();
  for (const t of turnosResumen) {
    if (t.estado === "disponible") diasConDisponible.add(t.fecha);
    if (t.estado === "reservado") diasConReservado.add(t.fecha);
  }

  // Calendar math
  const primerDia = new Date(anio, mes, 1);
  const ultimoDia = new Date(anio, mes + 1, 0);
  const startPad = primerDia.getDay() === 0 ? 6 : primerDia.getDay() - 1; // Monday=0
  const totalDias = ultimoDia.getDate();

  function handleDiaClick(fecha: string) {
    // Calculate week offset from today to jump the weekly calendar
    const target = new Date(fecha + "T12:00:00");
    const lunesTarget = getLunes(target);
    const lunesHoy = getLunes(hoy);
    const diffMs = lunesTarget.getTime() - lunesHoy.getTime();
    const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
    setSemanaOffset(diffWeeks);
  }

  function prevMes() {
    if (mes === 0) { setMes(11); setAnio(anio - 1); }
    else setMes(mes - 1);
  }

  function nextMes() {
    if (mes === 11) { setMes(0); setAnio(anio + 1); }
    else setMes(mes + 1);
  }

  return (
    <div className="space-y-4">
      {/* Mini calendario mensual */}
      <div className="rounded-xl bg-white p-4" style={{ border: "0.5px solid #e5e7eb" }}>
        <div className="flex items-center justify-between">
          <button onClick={prevMes} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">←</button>
          <p className="text-xs font-medium text-gray-700">{MESES[mes]} {anio}</p>
          <button onClick={nextMes} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">→</button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-0.5">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="text-center text-[9px] text-gray-400">{d}</div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-0.5">
          {Array.from({ length: startPad }).map((_, i) => <div key={`p-${i}`} className="h-7" />)}
          {Array.from({ length: totalDias }).map((_, i) => {
            const dia = i + 1;
            const fecha = `${anio}-${(mes + 1).toString().padStart(2, "0")}-${dia.toString().padStart(2, "0")}`;
            const esHoy = fecha === hoyStr;
            const tieneDisp = diasConDisponible.has(fecha);
            const tieneRes = diasConReservado.has(fecha);
            const tieneAlgo = tieneDisp || tieneRes;

            return (
              <button
                key={dia}
                onClick={() => tieneAlgo && handleDiaClick(fecha)}
                className={`relative flex h-7 items-center justify-center rounded text-[11px] transition-all duration-100 ${
                  esHoy ? "font-medium text-[#1D9E75]" : tieneAlgo ? "text-gray-700 hover:bg-gray-50 cursor-pointer" : "text-gray-300"
                }`}
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

      {/* Calendario semanal + métricas + listado */}
      <CalendarioAgendaMedico medicoId={medicoId} precio={precio} semanaOffset={semanaOffset} onSemanaChange={setSemanaOffset} />
    </div>
  );
}
