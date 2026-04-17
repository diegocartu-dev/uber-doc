"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import OrigenBadge from "@/components/OrigenBadge";
import { useDashboardMedico } from "./DashboardMedicoProvider";
import { capitalizarNombre } from "@/lib/utils/texto";

type TurnoEspera = {
  id: string;
  fecha: string;
  hora_inicio: string;
  paciente_nombre: string;
  paciente_tabla_id: string | null;
  entradoEn: number; // timestamp ms para contador
  canal_origen?: string;
};

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
  medicoId,
  hayEnCurso,
}: {
  medicoId: string;
  hayEnCurso?: boolean;
}) {
  const { turnosEspera: turnos } = useDashboardMedico();
  const [isPending, startTransition] = useTransition();
  const [notifPermiso, setNotifPermiso] = useState<string>("default");

  // Check notif permission
  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifPermiso(Notification.permission);
  }, []);

  function handleIniciar(turnoId: string) {
    startTransition(async () => {
      // La creacion de sala LiveKit y la transicion de estado
      // se hacen en el server component de /turno/[turnoId]/video
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
          Activar notificaciones para turnos
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
          Activar notificaciones para no perderte turnos
        </button>
      )}
      {turnos.map((t) => (
        <div
          key={t.id}
          className="rounded-xl bg-white p-5"
          style={{ border: "1px solid #378ADD" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#378ADD]" />
                <span className="text-xs font-medium tracking-wide text-[#378ADD]">TURNO EN ESPERA</span>
                <span className="text-sm font-medium text-[#D85A30]">
                  <Contador desde={t.entradoEn} />
                </span>
              </div>
              {t.paciente_tabla_id ? (
                <a href={`/medico/paciente/${t.paciente_tabla_id}`} className="mt-2 block text-lg font-medium text-gray-900 hover:text-[#378ADD]">{capitalizarNombre(t.paciente_nombre)}</a>
              ) : (
                <p className="mt-2 text-lg font-medium text-gray-900">{capitalizarNombre(t.paciente_nombre)}</p>
              )}
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-sm text-gray-500">
                  Turno de las {t.hora_inicio} hs
                </span>
                <OrigenBadge canalOrigen={t.canal_origen ?? null} />
              </div>
            </div>
            {hayEnCurso ? (
              <span className="shrink-0 rounded-lg bg-amber-50 px-3 py-2 text-sm text-[#D85A30]">
                Finalizá la consulta actual primero
              </span>
            ) : (
              <button
                onClick={() => handleIniciar(t.id)}
                disabled={isPending}
                className="shrink-0 rounded-lg bg-[#378ADD] px-6 py-3 text-base font-medium text-white hover:bg-[#2e6fb5] disabled:opacity-50 active:scale-95 transition-all duration-100"
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
