"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Turno = {
  id: string; fecha: string; hora_inicio: string; hora_fin: string;
  estado: string; monto: number | null; paciente_nombre: string | null;
};

const DIAS_LABEL = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const DIAS_SEMANA_LARGO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function getLunes(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function fStr(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function formatFechaLarga(f: string) {
  const d = new Date(f + "T12:00:00");
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${dias[d.getDay()]} ${d.getDate()} de ${MESES_CORTO[d.getMonth()]}`;
}

const HORAS: string[] = [];
for (let h = 7; h < 21; h++) {
  for (let m = 0; m < 60; m += 20) {
    HORAS.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  }
}

export default function PanelDerecho({ medicoId, precio }: { medicoId: string; precio: number }) {
  const hoy = new Date();
  const hoyStr = fStr(hoy);

  const [lunesActual, setLunesActual] = useState(() => getLunes(hoy));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [cargando, setCargando] = useState(true);
  const [turnosMes, setTurnosMes] = useState<{ fecha: string; estado: string }[]>([]);

  const mesVisible = lunesActual.getMonth();
  const anioVisible = lunesActual.getFullYear();
  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunesActual); d.setDate(d.getDate() + i); return fStr(d);
  });
  const semanaSet = new Set(diasSemana);

  function semPrev() { setLunesActual((p) => { const d = new Date(p); d.setDate(d.getDate() - 7); return d; }); }
  function semNext() { setLunesActual((p) => { const d = new Date(p); d.setDate(d.getDate() + 7); return d; }); }
  function mesPrev() { setLunesActual(getLunes(new Date(anioVisible, mesVisible - 1, 15))); }
  function mesNext() { setLunesActual(getLunes(new Date(anioVisible, mesVisible + 1, 15))); }
  function goHoy() { setLunesActual(getLunes(hoy)); }
  function goDia(f: string) { setLunesActual(getLunes(new Date(f + "T12:00:00"))); }

  // Fetch turnos semana
  useEffect(() => {
    async function load() {
      setCargando(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("turnos").select("id, fecha, hora_inicio, hora_fin, estado, monto, paciente_id")
        .eq("medico_id", medicoId).gte("fecha", diasSemana[0]).lte("fecha", diasSemana[6])
        .order("hora_inicio", { ascending: true });
      if (!data) { setTurnos([]); setCargando(false); return; }
      const pacIds = [...new Set(data.filter((t) => t.paciente_id).map((t) => t.paciente_id))];
      let nombres = new Map<string, string>();
      if (pacIds.length > 0) {
        const { data: pacs } = await supabase.from("pacientes").select("id, nombre_completo").in("id", pacIds);
        nombres = new Map((pacs ?? []).map((p) => [p.id, p.nombre_completo]));
      }
      setTurnos(data.map((t) => ({
        id: t.id, fecha: t.fecha, hora_inicio: t.hora_inicio.slice(0, 5), hora_fin: t.hora_fin.slice(0, 5),
        estado: t.estado, monto: t.monto,
        paciente_nombre: t.paciente_id ? (nombres.get(t.paciente_id) ?? null) : null,
      })));
      setCargando(false);
    }
    load();
  }, [medicoId, diasSemana[0], diasSemana[6]]);

  // Fetch turnos mes
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const p = `${anioVisible}-${(mesVisible + 1).toString().padStart(2, "0")}-01`;
      const u = `${anioVisible}-${(mesVisible + 1).toString().padStart(2, "0")}-${new Date(anioVisible, mesVisible + 1, 0).getDate()}`;
      const { data } = await supabase.from("turnos").select("fecha, estado").eq("medico_id", medicoId).gte("fecha", p).lte("fecha", u).in("estado", ["disponible", "reservado"]);
      setTurnosMes(data ?? []);
    }
    load();
  }, [medicoId, mesVisible, anioVisible]);

  const turnoMap = new Map<string, Turno>();
  for (const t of turnos) turnoMap.set(`${t.fecha}-${t.hora_inicio}`, t);

  const disponibles = turnos.filter((t) => t.estado === "disponible").length;
  const reservados = turnos.filter((t) => t.estado === "reservado");
  const bloqueados = turnos.filter((t) => t.estado === "bloqueado").length;

  const reservadosPorDia = new Map<string, Turno[]>();
  for (const t of reservados) {
    if (!reservadosPorDia.has(t.fecha)) reservadosPorDia.set(t.fecha, []);
    reservadosPorDia.get(t.fecha)!.push(t);
  }

  const diasConDisp = new Set<string>(); const diasConRes = new Set<string>();
  for (const t of turnosMes) { if (t.estado === "disponible") diasConDisp.add(t.fecha); if (t.estado === "reservado") diasConRes.add(t.fecha); }

  const primerDia = new Date(anioVisible, mesVisible, 1);
  const startPad = primerDia.getDay() === 0 ? 6 : primerDia.getDay() - 1;
  const totalDias = new Date(anioVisible, mesVisible + 1, 0).getDate();

  const B = "0.5px solid #e5e7eb";

  return (
    <div className="space-y-4">
      {/* Métricas */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full px-3 py-1 text-[11px] font-medium" style={{ background: "#9FE1CB", color: "#085041" }}>● {disponibles} disponibles</span>
        <span className="rounded-full px-3 py-1 text-[11px] font-medium" style={{ background: "#378ADD", color: "#fff" }}>● {reservados.length} reservados</span>
        <span className="rounded-full px-3 py-1 text-[11px] font-medium" style={{ background: "#F7C1C1", color: "#791F1F" }}>● {bloqueados} bloqueados</span>
        <button onClick={goHoy} className="rounded-full bg-[#1D9E75] px-3 py-1 text-[11px] font-medium text-white">Hoy</button>
      </div>

      {/* Calendario mensual */}
      <div className="rounded-xl bg-white p-4" style={{ border: B }}>
        <div className="flex items-center justify-between">
          <button onClick={mesPrev} className="rounded px-2 py-1 text-[13px] text-gray-500 hover:bg-gray-100">←</button>
          <p className="text-[13px] font-medium text-gray-800">{MESES[mesVisible]} {anioVisible}</p>
          <button onClick={mesNext} className="rounded px-2 py-1 text-[13px] text-gray-500 hover:bg-gray-100">→</button>
        </div>
        <div className="mt-3 grid grid-cols-7">
          {DIAS_LABEL.map((d) => <div key={d} className="py-1 text-center text-[11px] font-medium text-gray-500">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: startPad }).map((_, i) => <div key={`p${i}`} className="h-9" />)}
          {Array.from({ length: totalDias }).map((_, i) => {
            const dia = i + 1;
            const fecha = `${anioVisible}-${(mesVisible + 1).toString().padStart(2, "0")}-${dia.toString().padStart(2, "0")}`;
            const esHoy = fecha === hoyStr;
            const enSemana = semanaSet.has(fecha);
            return (
              <button key={dia} onClick={() => goDia(fecha)}
                className={`relative flex h-9 items-center justify-center text-[14px] cursor-pointer transition-all duration-100 ${
                  esHoy ? "font-semibold" : "hover:bg-gray-50"
                } ${enSemana && !esHoy ? "font-medium" : ""}`}
                style={esHoy ? { background: "#1D9E75", color: "white", borderRadius: "50%", width: "36px", height: "36px", margin: "auto" }
                  : enSemana ? { background: "#E1F5EE", borderRadius: "4px", color: "#1a1a1a" }
                  : { color: (diasConDisp.has(fecha) || diasConRes.has(fecha)) ? "#1a1a1a" : "#d1d5db" }}
              >
                {dia}
                {(diasConDisp.has(fecha) || diasConRes.has(fecha)) && !esHoy && (
                  <span className="absolute bottom-0 flex gap-0.5">
                    {diasConDisp.has(fecha) && <span className="inline-block h-1 w-1 rounded-full bg-[#1D9E75]" />}
                    {diasConRes.has(fecha) && <span className="inline-block h-1 w-1 rounded-full bg-[#378ADD]" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Calendario semanal */}
      <div className="overflow-hidden rounded-xl bg-white" style={{ border: B }}>
        <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: B }}>
          <button onClick={semPrev} className="rounded px-2 py-1 text-[13px] text-gray-500 hover:bg-gray-100">←</button>
          <p className="text-[12px] font-medium text-gray-600">
            {new Date(diasSemana[0] + "T12:00:00").getDate()}/{new Date(diasSemana[0] + "T12:00:00").getMonth() + 1} — {new Date(diasSemana[6] + "T12:00:00").getDate()}/{new Date(diasSemana[6] + "T12:00:00").getMonth() + 1}
          </p>
          <button onClick={semNext} className="rounded px-2 py-1 text-[13px] text-gray-500 hover:bg-gray-100">→</button>
        </div>

        {cargando ? (
          <div className="py-10 text-center text-[12px] text-gray-400">Cargando...</div>
        ) : (
          <div>
            <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, 1fr)", borderBottom: B }}>
              <div />
              {diasSemana.map((fecha, i) => {
                const d = new Date(fecha + "T12:00:00");
                const esHoy = fecha === hoyStr;
                return (
                  <div key={fecha} className="py-1.5 text-center">
                    <p className="text-[10px] text-gray-500">{DIAS_SEMANA_LARGO[i]}</p>
                    <p className={`text-[12px] font-medium ${esHoy ? "mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-[#1D9E75] text-white" : "text-gray-800"}`}>{d.getDate()}</p>
                  </div>
                );
              })}
            </div>

            <div className="max-h-[380px] overflow-y-auto">
              {HORAS.map((hora) => (
                <div key={hora} className="grid" style={{ gridTemplateColumns: "48px repeat(7, 1fr)", borderBottom: "0.5px solid #f0f0f0" }}>
                  <div className="flex items-center justify-end pr-2 text-[11px] text-gray-400" style={{ height: "28px" }}>{hora}</div>
                  {diasSemana.map((fecha) => {
                    const t = turnoMap.get(`${fecha}-${hora}`);
                    if (!t) return <div key={fecha} style={{ height: "28px" }} />;
                    return (
                      <div key={fecha} className="flex items-center justify-center" style={{
                        height: "28px",
                        background: t.estado === "disponible" ? "#9FE1CB" : t.estado === "reservado" ? "#378ADD" : t.estado === "bloqueado" ? "#F7C1C1" : "transparent",
                      }}>
                        {t.estado === "reservado" && (
                          <span style={{ fontSize: "11px", fontWeight: 500, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 4px", width: "100%" , textAlign: "center" }}>
                            {t.paciente_nombre ?? t.hora_inicio}
                          </span>
                        )}
                        {t.estado === "bloqueado" && <span style={{ fontSize: "10px", color: "#791F1F" }}>—</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Turnos reservados */}
      <div className="rounded-xl bg-white p-4" style={{ border: B }}>
        <p className="text-[11px] font-medium tracking-wider text-gray-500">TURNOS RESERVADOS</p>
        {reservados.length === 0 ? (
          <p className="mt-3 text-[12px] text-gray-400">Sin turnos reservados esta semana</p>
        ) : (
          <div className="mt-3 space-y-3">
            {[...reservadosPorDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, ts]) => (
              <div key={fecha}>
                <p className="text-[12px] font-medium text-gray-700">{formatFechaLarga(fecha)}</p>
                <div className="mt-1 space-y-0.5">
                  {ts.map((t) => (
                    <p key={t.id} className="text-[12px] text-gray-500">
                      {t.hora_inicio} hs · {t.paciente_nombre ?? "Paciente"}
                      <span className="ml-1.5 font-medium text-[#1D9E75]">${(t.monto ?? precio).toLocaleString("es-AR")}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
