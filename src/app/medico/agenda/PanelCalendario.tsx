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
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function fechaStr(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

export default function PanelCalendario({ medicoId, precio }: { medicoId: string; precio: number }) {
  const hoy = new Date();
  const hoyStr = fechaStr(hoy);

  // Estado único: el lunes de la semana seleccionada
  const [lunesSeleccionado, setLunesSeleccionado] = useState(() => getLunes(hoy));

  // El mes visible del mini calendario — se deriva del lunes pero puede navegarse independientemente
  const [mesOverride, setMesOverride] = useState<{ mes: number; anio: number } | null>(null);

  const mesVisible = mesOverride?.mes ?? lunesSeleccionado.getMonth();
  const anioVisible = mesOverride?.anio ?? lunesSeleccionado.getFullYear();

  // Cuando el semanal cambia (flechas o click en día), resetear el override para que siga al semanal
  function cambiarSemana(nuevoLunes: Date) {
    setLunesSeleccionado(nuevoLunes);
    setMesOverride(null); // el mensual sigue al semanal
  }

  // Flechas del semanal
  function semanaAnterior() {
    const prev = new Date(lunesSeleccionado);
    prev.setDate(prev.getDate() - 7);
    cambiarSemana(prev);
  }

  function semanaSiguiente() {
    const next = new Date(lunesSeleccionado);
    next.setDate(next.getDate() + 7);
    cambiarSemana(next);
  }

  // Flechas del mensual — solo cambian la vista del mes, NO el semanal
  function mesAnterior() {
    const m = mesOverride ?? { mes: lunesSeleccionado.getMonth(), anio: lunesSeleccionado.getFullYear() };
    if (m.mes === 0) setMesOverride({ mes: 11, anio: m.anio - 1 });
    else setMesOverride({ mes: m.mes - 1, anio: m.anio });
  }

  function mesSiguiente() {
    const m = mesOverride ?? { mes: lunesSeleccionado.getMonth(), anio: lunesSeleccionado.getFullYear() };
    if (m.mes === 11) setMesOverride({ mes: 0, anio: m.anio + 1 });
    else setMesOverride({ mes: m.mes + 1, anio: m.anio });
  }

  // Click en día del mensual — cambia el semanal a esa semana
  function handleDiaClick(fecha: string) {
    cambiarSemana(getLunes(new Date(fecha + "T12:00:00")));
  }

  // Botón Hoy — ambos calendarios vuelven
  function handleHoy() {
    setLunesSeleccionado(getLunes(hoy));
    setMesOverride(null);
  }

  // Semana offset para CalendarioAgendaMedico (relativo a hoy)
  const lunesHoy = getLunes(hoy);
  const semanaOffset = Math.round((lunesSeleccionado.getTime() - lunesHoy.getTime()) / (7 * 24 * 60 * 60 * 1000));

  function handleSemanaChange(offset: number) {
    const nuevoLunes = new Date(lunesHoy);
    nuevoLunes.setDate(nuevoLunes.getDate() + offset * 7);
    cambiarSemana(nuevoLunes);
  }

  // Días de la semana actual para highlight en el mensual
  const semanaActualDias = new Set(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lunesSeleccionado);
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

            return (
              <button
                key={dia}
                onClick={() => handleDiaClick(fecha)}
                className={`relative flex h-7 items-center justify-center rounded text-[11px] transition-all duration-100 cursor-pointer ${
                  esHoy ? "font-medium text-[#1D9E75]"
                    : (tieneDisp || tieneRes) ? "text-gray-700 hover:bg-gray-100"
                    : "text-gray-300 hover:bg-gray-50"
                }`}
                style={enSemana ? { background: "#f0fdf4" } : undefined}
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
