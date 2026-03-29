"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Turno = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
  monto: number | null;
  paciente_nombre: string | null;
};

const DIAS_ALL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function getLunes(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function formatFechaCorta(f: string) {
  const d = new Date(f + "T12:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatFechaLarga(f: string) {
  const d = new Date(f + "T12:00:00");
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${dias[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

const HORAS: string[] = [];
for (let h = 7; h < 20; h++) {
  for (let m = 0; m < 60; m += 20) {
    HORAS.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  }
}

export default function CalendarioAgendaMedico({
  medicoId, precio, semanaOffset: semanaOffsetProp, onSemanaChange, onHoy,
}: {
  medicoId: string; precio: number;
  semanaOffset?: number; onSemanaChange?: (offset: number) => void; onHoy?: () => void;
}) {
  const [semanaOffsetLocal, setSemanaOffsetLocal] = useState(0);
  const semanaOffset = semanaOffsetProp ?? semanaOffsetLocal;
  const setSemanaOffset = onSemanaChange ?? setSemanaOffsetLocal;
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [cargando, setCargando] = useState(true);

  const hoy = new Date();
  const lunes = getLunes(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + semanaOffset * 7));
  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
  const hoyStr = hoy.toISOString().split("T")[0];

  useEffect(() => {
    async function fetchTurnos() {
      setCargando(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("turnos")
        .select("id, fecha, hora_inicio, hora_fin, estado, monto, paciente_id")
        .eq("medico_id", medicoId)
        .gte("fecha", diasSemana[0])
        .lte("fecha", diasSemana[6])
        .order("hora_inicio", { ascending: true });

      if (!data) { setTurnos([]); setCargando(false); return; }

      const pacIds = [...new Set(data.filter((t) => t.paciente_id).map((t) => t.paciente_id))];
      let nombres = new Map<string, string>();
      if (pacIds.length > 0) {
        const { data: pacs } = await supabase.from("pacientes").select("id, nombre_completo").in("id", pacIds);
        nombres = new Map((pacs ?? []).map((p) => [p.id, p.nombre_completo]));
      }

      setTurnos(data.map((t) => ({
        id: t.id, fecha: t.fecha,
        hora_inicio: t.hora_inicio.slice(0, 5), hora_fin: t.hora_fin.slice(0, 5),
        estado: t.estado, monto: t.monto,
        paciente_nombre: t.paciente_id ? (nombres.get(t.paciente_id) ?? null) : null,
      })));
      setCargando(false);
    }
    fetchTurnos();
  }, [medicoId, semanaOffset]);

  const turnoMap = new Map<string, Turno>();
  for (const t of turnos) turnoMap.set(`${t.fecha}-${t.hora_inicio}`, t);

  const reservados = turnos.filter((t) => t.estado === "reservado");
  const ingresosConfirmados = reservados.reduce((sum, t) => sum + (t.monto ?? precio ?? 0), 0);

  const reservadosPorDia = new Map<string, Turno[]>();
  for (const t of reservados) {
    if (!reservadosPorDia.has(t.fecha)) reservadosPorDia.set(t.fecha, []);
    reservadosPorDia.get(t.fecha)!.push(t);
  }

  return (
    <div>
      {/* Métricas + leyenda */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#378ADD]/10 px-2.5 py-1 text-[11px] font-medium text-[#378ADD]">
          ● {reservados.length} reservado{reservados.length !== 1 ? "s" : ""}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
          ${ingresosConfirmados.toLocaleString("es-AR")}
        </span>
        <button
          onClick={() => { if (onHoy) onHoy(); else setSemanaOffset(0); }}
          className="rounded-full bg-[#1D9E75]/10 px-2.5 py-1 text-[11px] font-medium text-[#1D9E75]"
        >
          Hoy
        </button>
        <span className="ml-auto flex gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#9FE1CB]" />Disponible</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#B5D4F4]" />Reservado</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#F7C1C1]" />Bloqueado</span>
        </span>
      </div>

      {/* Calendario semanal */}
      <div className="mt-3 overflow-x-auto rounded-xl bg-white" style={{ border: "0.5px solid #e5e7eb" }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
          <button onClick={() => setSemanaOffset(semanaOffset - 1)} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">←</button>
          <p className="text-[11px] font-medium text-gray-500">
            {formatFechaCorta(diasSemana[0])} — {formatFechaCorta(diasSemana[6])}
          </p>
          <button onClick={() => setSemanaOffset(semanaOffset + 1)} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">→</button>
        </div>

        {cargando ? (
          <div className="py-10 text-center text-xs text-gray-400">Cargando...</div>
        ) : (
          <div className="w-full">
            <div className={`grid`} style={{ gridTemplateColumns: "40px repeat(7, minmax(60px, 1fr))", borderBottom: "0.5px solid #e5e7eb" }}>
              <div />
              {diasSemana.map((fecha, i) => {
                const d = new Date(fecha + "T12:00:00");
                const esHoy = fecha === hoyStr;
                return (
                  <div key={fecha} className="py-2 text-center">
                    <p className="text-[9px] text-gray-400">{DIAS_ALL[i]}</p>
                    <p className={`mt-0.5 text-[11px] font-medium ${esHoy ? "mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-[#1D9E75] text-white" : "text-gray-700"}`}>
                      {d.getDate()}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="max-h-[350px] overflow-y-auto">
              {HORAS.map((hora) => (
                <div key={hora} style={{ gridTemplateColumns: "40px repeat(7, minmax(60px, 1fr))", borderBottom: "0.5px solid #f3f4f6" }} className="grid">
                  <div className="flex items-center justify-end pr-2 text-[9px] text-gray-400" style={{ height: "26px" }}>
                    {hora}
                  </div>
                  {diasSemana.map((fecha) => {
                    const turno = turnoMap.get(`${fecha}-${hora}`);
                    if (!turno) return <div key={fecha} style={{ height: "26px" }} />;
                    return (
                      <div
                        key={fecha}
                        className="flex items-center justify-center text-[8px]"
                        style={{
                          height: "26px",
                          background:
                            turno.estado === "disponible" ? "#9FE1CB" :
                            turno.estado === "reservado" ? "#B5D4F4" :
                            turno.estado === "bloqueado" ? "#F7C1C1" : "transparent",
                        }}
                      >
                        {turno.estado === "reservado" && (
                          <span className="font-medium text-[#0C447C]">
                            ${((turno.monto ?? precio) / 1000).toFixed(0)}k
                          </span>
                        )}
                        {turno.estado === "bloqueado" && (
                          <span className="text-[#A32D2D]">×</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Listado reservados */}
      {reservados.length > 0 && (
        <div className="mt-4 rounded-xl bg-white p-4" style={{ border: "0.5px solid #e5e7eb" }}>
          <p className="text-[11px] font-medium tracking-wide text-gray-400">TURNOS RESERVADOS</p>
          <div className="mt-2 space-y-3">
            {[...reservadosPorDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, turnosDia]) => (
              <div key={fecha}>
                <p className="text-[11px] font-medium text-gray-600">{formatFechaLarga(fecha)}</p>
                <div className="mt-1 space-y-0.5">
                  {turnosDia.map((t) => (
                    <p key={t.id} className="text-[11px] text-gray-500">
                      {t.hora_inicio} hs — {t.paciente_nombre ?? "Paciente"}
                      <span className="ml-1.5 font-medium text-gray-700">${(t.monto ?? precio).toLocaleString("es-AR")}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!cargando && reservados.length === 0 && (
        <p className="mt-3 text-center text-[11px] text-gray-400">Sin turnos reservados esta semana</p>
      )}
    </div>
  );
}
