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

function offsetFromHoy(fecha: Date): number {
  const hoy = new Date();
  const lunesTarget = getLunes(fecha);
  const lunesHoy = getLunes(hoy);
  return Math.round((lunesTarget.getTime() - lunesHoy.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export default function PanelCalendario({ medicoId, precio }: { medicoId: string; precio: number }) {
  const hoy = new Date();
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [turnosResumen, setTurnosResumen] = useState<TurnoResumen[]>([]);

  // Derive mes/anio from the semana actual for sync
  const lunesActual = getLunes(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + semanaOffset * 7));
  const [mesVisible, setMesVisible] = useState(lunesActual.getMonth());
  const [anioVisible, setAnioVisible] = useState(lunesActual.getFullYear());

  const hoyStr = hoy.toISOString().split("T")[0];

  // Sync mensual when semanal changes via arrows
  useEffect(() => {
    const lun = getLunes(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + semanaOffset * 7));
    setMesVisible(lun.getMonth());
    setAnioVisible(lun.getFullYear());
  }, [semanaOffset]);

  // Fetch turno summaries for visible month
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

  // Calendar math
  const primerDia = new Date(anioVisible, mesVisible, 1);
  const ultimoDia = new Date(anioVisible, mesVisible + 1, 0);
  const startPad = primerDia.getDay() === 0 ? 6 : primerDia.getDay() - 1;
  const totalDias = ultimoDia.getDate();

  // Current week dates for highlight
  const semanaActualDias = new Set(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lunesActual);
      d.setDate(d.getDate() + i);
      return d.toISOString().split("T")[0];
    })
  );

  function handleDiaClick(fecha: string) {
    setSemanaOffset(offsetFromHoy(new Date(fecha + "T12:00:00")));
  }

  function handleHoy() {
    setSemanaOffset(0);
    setMesVisible(hoy.getMonth());
    setAnioVisible(hoy.getFullYear());
  }

  function prevMes() {
    if (mesVisible === 0) { setMesVisible(11); setAnioVisible(anioVisible - 1); }
    else setMesVisible(mesVisible - 1);
  }

  function nextMes() {
    if (mesVisible === 11) { setMesVisible(0); setAnioVisible(anioVisible + 1); }
    else setMesVisible(mesVisible + 1);
  }

  return (
    <div className="space-y-4">
      {/* Mini calendario mensual */}
      <div className="rounded-xl bg-white p-4" style={{ border: "0.5px solid #e5e7eb" }}>
        <div className="flex items-center justify-between">
          <button onClick={prevMes} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">←</button>
          <p className="text-xs font-medium text-gray-700">{MESES[mesVisible]} {anioVisible}</p>
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
            const fecha = `${anioVisible}-${(mesVisible + 1).toString().padStart(2, "0")}-${dia.toString().padStart(2, "0")}`;
            const esHoy = fecha === hoyStr;
            const enSemana = semanaActualDias.has(fecha);
            const tieneDisp = diasConDisponible.has(fecha);
            const tieneRes = diasConReservado.has(fecha);
            const tieneAlgo = tieneDisp || tieneRes;

            return (
              <button
                key={dia}
                onClick={() => handleDiaClick(fecha)}
                className={`relative flex h-7 items-center justify-center rounded text-[11px] transition-all duration-100 ${
                  esHoy
                    ? "font-medium text-[#1D9E75]"
                    : tieneAlgo
                      ? "text-gray-700 hover:bg-gray-100 cursor-pointer"
                      : "text-gray-300 hover:bg-gray-50 cursor-pointer"
                } ${enSemana ? "bg-[#1D9E75]/5" : ""}`}
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

      {/* Calendario semanal — botón Hoy se pasa via onHoy */}
      <CalendarioAgendaMedico
        medicoId={medicoId}
        precio={precio}
        semanaOffset={semanaOffset}
        onSemanaChange={setSemanaOffset}
        onHoy={handleHoy}
      />
    </div>
  );
}
