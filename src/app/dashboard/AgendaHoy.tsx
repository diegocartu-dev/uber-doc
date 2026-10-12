"use client";

import { useEffect, useRef, useState } from "react";
import { capitalizarNombre } from "@/lib/utils/texto";
import { useDashboardMedico } from "./DashboardMedicoProvider";

type Turno = {
  id: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
  paciente_nombre: string;
};

type TurnoProximo = Turno & { fecha: string };

const estadoConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  confirmado: { bg: "transparent", text: "#888780", dot: "#888780", label: "Confirmado" },
  en_espera: { bg: "#eff6ff", text: "#378ADD", dot: "#378ADD", label: "En espera" },
  en_curso: { bg: "#eff6ff", text: "#378ADD", dot: "#378ADD", label: "En curso" },
  completado: { bg: "transparent", text: "#d1d5db", dot: "#d1d5db", label: "Completado" },
};

const MESES_CORTO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function formatFechaCorta(f: string) {
  const d = new Date(f + "T12:00:00");
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${dias[d.getDay()]} ${d.getDate()} de ${MESES_CORTO[d.getMonth()]}`;
}

export default function AgendaHoy({ turnos, proximosTurnos = [] }: { turnos: Turno[]; proximosTurnos?: TurnoProximo[] }) {
  // Dos momentos de un turno confirmado (= pagado) cuyo paciente todavía no
  // entró: "antes" (faltan 15 min o menos) y "no_entro" (ya es la hora). El
  // segundo nació el 12/10/2026: una profesional esperó a un paciente que nunca
  // abrió la sala y la pantalla no le decía nada — el botón «Iniciar turno»
  // solo aparece cuando el paciente entra, y no sabía que eso era lo que faltaba.
  const [alertas, setAlertas] = useState<
    { id: string; nombre: string; hora: string; minutos: number; tipo: "antes" | "no_entro"; cierre: string }[]
  >([]);
  // Los que ya entraron a la sala los trae el sondeo del panel (cada 5 s): la
  // lista de hoy viene del servidor y no se entera sola.
  // Se ACUMULAN: un turno sale de `turnosEspera` cuando pasa a en_curso, y si el
  // profesional lo empezó desde el celular, esta pantalla (en la PC) seguiría
  // viéndolo `confirmado` y diría "todavía no entró" en plena consulta.
  const { turnosEspera } = useDashboardMedico();
  const vistosEnSala = useRef(new Set<string>());
  const enSala = turnosEspera.map((t) => t.id).join(",");

  // Verificar alertas de 15 minutos cada 30 segundos
  useEffect(() => {
    function checkAlertas() {
      const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
      const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
      const nuevas: typeof alertas = [];

      for (const id of enSala.split(",").filter(Boolean)) vistosEnSala.current.add(id);
      const yaEntraron = vistosEnSala.current;
      for (const t of turnos) {
        if (t.estado !== "confirmado" || yaEntraron.has(t.id)) continue;
        const [h, m] = t.hora_inicio.split(":").map(Number);
        const minTurno = h * 60 + m;
        const diff = minTurno - minAhora;
        // El cron resolver-turnos-vencidos cierra el turno sin paciente pasados
        // 20 minutos del FIN (su GRACIA_MIN). Hasta ahí se avisa.
        const [hf, mf] = t.hora_fin.split(":").map(Number);
        const minCierre = hf * 60 + mf + 20;
        const cierre = `${String(Math.floor(minCierre / 60) % 24).padStart(2, "0")}:${String(minCierre % 60).padStart(2, "0")}`;
        const base = { id: t.id, nombre: capitalizarNombre(t.paciente_nombre), hora: t.hora_inicio.slice(0, 5), minutos: diff, cierre };

        if (diff > 0 && diff <= 15) {
          nuevas.push({ ...base, tipo: "antes" });
        } else if (diff <= 0 && minAhora <= minCierre) {
          nuevas.push({ ...base, tipo: "no_entro" });
        }
      }

      setAlertas(nuevas);

      // Badge en título del navegador
      const enEspera = turnos.filter((t) => t.estado === "en_espera").length;
      const totalAlertas = nuevas.length + enEspera;
      document.title = totalAlertas > 0 ? `(${totalAlertas}) Docto — Médico` : "Docto — Médico";
    }

    checkAlertas();
    const interval = setInterval(checkAlertas, 30000);
    return () => clearInterval(interval);
  }, [turnos, enSala]);

  // OJO: acá vivía un `new Notification(...)` legacy (30/03) que en Chrome Android tira
  // TypeError SIEMPRE (constructor prohibido desde Chrome 42 — usar showNotification del
  // service worker) y, sin error boundary, mataba TODO el dashboard justo cuando un
  // paciente entraba en sala de espera (incidente 08/07/2026). Se eliminó: el aviso
  // "paciente listo" ya lo cubren el popup del provider + el push server-side (07/06).
  // NO reintroducir el constructor Notification en componentes.

  const bloqueProximos = proximosTurnos.length > 0 ? (
    <div className="rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
      <p className="text-xs font-medium tracking-wide text-gray-400">PRÓXIMOS TURNOS</p>
      <div className="mt-3 space-y-1">
        {proximosTurnos.map((t) => {
          const config = estadoConfig[t.estado] ?? estadoConfig.confirmado;
          return (
            <div key={t.id} className="flex items-center justify-between rounded-lg p-2.5">
              <div className="flex items-center gap-3">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#E8E0F7", border: "1.5px solid #6B4FA0" }} />
                <div>
                  <p className="text-[13px] font-medium text-gray-900">
                    {formatFechaCorta(t.fecha)} · {t.hora_inicio.slice(0, 5)}
                  </p>
                  <p className="text-[12px]" style={{ color: config.text }}>
                    {capitalizarNombre(t.paciente_nombre)}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-medium" style={{ color: "#6B4FA0" }}>
                {config.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  if (turnos.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
          <p className="text-sm font-medium tracking-wide text-gray-400">AGENDA DE HOY</p>
          <p className="mt-3 text-sm text-gray-400">Sin turnos programados para hoy</p>
        </div>
        {bloqueProximos}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Alertas proactivas */}
      {alertas.map((a) => (
        <div key={a.id} className="rounded-xl p-5" style={{ background: "#FFF7ED", border: "1px solid #D85A30" }}>
          <div className="flex items-center gap-2">
            <span className="text-lg">⏰</span>
            <p className="text-base font-medium" style={{ color: "#D85A30" }}>
              {a.tipo === "antes"
                ? `Turno con ${a.nombre} a las ${a.hora} — en ${a.minutos} minutos`
                : `${a.nombre} todavía no entró a la sala (turno de las ${a.hora})`}
            </p>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            {a.tipo === "antes"
              ? "Cuando entre a la sala te avisamos y acá aparece el botón «Iniciar turno»."
              : `Te avisamos apenas entre, y acá aparece el botón «Iniciar turno». Si no entra, no tenés que hacer nada: el turno se cierra solo después de las ${a.cierre}.`}
          </p>
        </div>
      ))}

      {/* Lista de turnos */}
      <div className="rounded-xl bg-white p-5" style={{ border: "0.5px solid #e5e7eb" }}>
        <p className="text-xs font-medium tracking-wide text-gray-400">AGENDA DE HOY</p>
        <div className="relative">
          <div className="mt-3 max-h-[280px] space-y-1 overflow-y-auto lg:max-h-none lg:overflow-visible">
            {turnos.map((t) => {
              const config = estadoConfig[t.estado] ?? estadoConfig.confirmado;
              const esAnimado = t.estado === "en_espera";
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg p-2.5"
                  style={{ background: config.bg }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${esAnimado ? "animate-pulse" : ""}`}
                      style={{ background: config.dot }}
                    />
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: t.estado === "completado" ? "#d1d5db" : "#1a1a1a" }}>
                        {t.hora_inicio.slice(0, 5)} — {t.hora_fin.slice(0, 5)}
                      </p>
                      <p className="text-[12px]" style={{ color: config.text }}>
                        {capitalizarNombre(t.paciente_nombre)}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium" style={{ color: config.text }}>
                    {config.label}
                  </span>
                </div>
              );
            })}
          </div>
          {turnos.length >= 5 && (
            <div
              className="pointer-events-none sticky bottom-0 h-10 lg:hidden"
              style={{ background: "linear-gradient(transparent, white)", marginTop: "-40px" }}
            />
          )}
        </div>
      </div>

      {bloqueProximos}
    </div>
  );
}
