"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { soundPacienteEsperando } from "@/lib/sounds";

const POLL_INTERVAL = 3000;

type TurnoEspera = {
  id: string;
  fecha: string;
  hora_inicio: string;
  paciente_nombre: string;
  paciente_tabla_id: string | null;
  entradoEn: number; // timestamp ms para contador
};

function getHoyAR(): string {
  const ar = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  return `${ar.getFullYear()}-${(ar.getMonth() + 1).toString().padStart(2, "0")}-${ar.getDate().toString().padStart(2, "0")}`;
}

function Contador({ desde }: { desde: number }) {
  const [seg, setSeg] = useState(Math.floor((Date.now() - desde) / 1000));
  useEffect(() => {
    const i = setInterval(() => setSeg(Math.floor((Date.now() - desde) / 1000)), 1000);
    return () => clearInterval(i);
  }, [desde]);
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return <span className="tabular-nums">{m}:{s.toString().padStart(2, "0")}</span>;
}

export default function TurnosEnEspera({
  turnos: turnosIniciales,
  medicoId,
  hayEnCurso,
}: {
  turnos: TurnoEspera[];
  medicoId: string;
  hayEnCurso?: boolean;
}) {
  const [turnos, setTurnos] = useState(turnosIniciales);
  const [isPending, startTransition] = useTransition();
  const [notifPermiso, setNotifPermiso] = useState<string>("default");

  useEffect(() => { setTurnos(turnosIniciales); }, [turnosIniciales]);

  // Check notif permission
  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifPermiso(Notification.permission);
  }, []);

  // Polling cada 3s — reemplaza Realtime que no funciona en este setup
  const prevCountRef = useRef(turnosIniciales.length);

  useEffect(() => {
    const supabase = createClient();

    async function fetchEspera() {
      const hoy = getHoyAR();
      const { data } = await supabase
        .from("turnos")
        .select("id, fecha, hora_inicio, paciente_id")
        .eq("medico_id", medicoId)
        .eq("fecha", hoy)
        .eq("estado", "en_espera")
        .order("hora_inicio", { ascending: true });

      if (!data) return;

      const pacIds = [...new Set(data.map((t) => t.paciente_id).filter(Boolean))];
      let nombres = new Map<string, string>();
      if (pacIds.length > 0) {
        const { data: pacs } = await supabase.from("pacientes").select("id, nombre_completo").in("id", pacIds);
        nombres = new Map((pacs ?? []).map((p) => [p.id, p.nombre_completo]));
      }

      setTurnos((prev) => {
        const nuevos = data.map((t) => {
          const existente = prev.find((p) => p.id === t.id);
          return {
            id: t.id,
            fecha: t.fecha,
            hora_inicio: t.hora_inicio.slice(0, 5),
            paciente_nombre: nombres.get(t.paciente_id) ?? "Paciente",
            paciente_tabla_id: t.paciente_id,
            entradoEn: existente?.entradoEn ?? Date.now(),
          };
        });
        return nuevos;
      });

      // Sonar si hay más turnos que antes
      if (data.length > prevCountRef.current) {
        soundPacienteEsperando();
      }
      prevCountRef.current = data.length;
    }

    fetchEspera();
    const interval = setInterval(fetchEspera, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [medicoId]);

  // Badge en título cuando hay pacientes esperando
  useEffect(() => {
    if (turnos.length > 0) {
      document.title = `(${turnos.length}) Docto — Médico`;
    }
  }, [turnos.length]);

  function handleIniciar(turnoId: string) {
    startTransition(async () => {
      const supabase = createClient();
      await supabase
        .from("turnos")
        .update({ estado: "en_curso", iniciado_en: new Date().toISOString() })
        .eq("id", turnoId);

      const res = await fetch("/api/videollamada-turno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId: turnoId }),
      });
      const data = await res.json();
      if (data.url) {
        await supabase.from("turnos").update({ sala_video_url: data.url }).eq("id", turnoId);
      }
      window.location.href = `/turno/${turnoId}/video`;
    });
  }

  if (turnos.length === 0) {
    // Solo mostrar botón de notificaciones si no tiene permiso
    if (notifPermiso === "default") {
      return (
        <button
          onClick={() => Notification.requestPermission().then((p) => setNotifPermiso(p))}
          className="w-full rounded-lg bg-gray-50 px-4 py-2 text-xs text-gray-500 hover:bg-gray-100"
          style={{ border: "0.5px solid #e5e7eb" }}
        >
          🔔 Activar notificaciones para turnos
        </button>
      );
    }
    return null;
  }

  return (
    <div className="space-y-3">
      {notifPermiso === "default" && (
        <button
          onClick={() => Notification.requestPermission().then((p) => setNotifPermiso(p))}
          className="w-full rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-700"
          style={{ border: "0.5px solid #fbbf24" }}
        >
          🔔 Activar notificaciones para no perderte turnos
        </button>
      )}
      {turnos.map((t) => (
        <div
          key={t.id}
          className="rounded-xl bg-white p-5"
          style={{ border: "1px solid #1D9E75" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#1D9E75]" />
                <span className="text-xs font-medium tracking-wide text-[#1D9E75]">TURNO EN ESPERA</span>
                <span className="text-xs text-gray-400">
                  <Contador desde={t.entradoEn} />
                </span>
              </div>
              {t.paciente_tabla_id ? (
                <a href={`/medico/paciente/${t.paciente_tabla_id}`} className="mt-2 block text-[15px] font-medium text-gray-900 hover:text-[#1D9E75]">{t.paciente_nombre}</a>
              ) : (
                <p className="mt-2 text-[15px] font-medium text-gray-900">{t.paciente_nombre}</p>
              )}
              <p className="mt-0.5 text-sm text-gray-500">
                Turno de las {t.hora_inicio} hs
              </p>
            </div>
            {hayEnCurso ? (
              <span className="shrink-0 text-xs text-gray-400">
                Finalizá la consulta actual primero
              </span>
            ) : (
              <button
                onClick={() => handleIniciar(t.id)}
                disabled={isPending}
                className="shrink-0 rounded-lg bg-[#1D9E75] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#178a64] disabled:opacity-50 active:scale-95 transition-all duration-100"
              >
                {isPending ? "Iniciando..." : "Iniciar turno"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
