"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Wifi, Users, Stethoscope } from "lucide-react";

/**
 * Contador en vivo de usuarios navegando Docto — lee el canal Realtime
 * `presencia-online` (poblado por PresenciaTracker en las páginas de
 * paciente/médico). El admin se suscribe SIN trackear → no se cuenta a sí
 * mismo. Conteo por usuario único (presence key = user.id).
 */
export default function OnlineAhora() {
  const [pacientes, setPacientes] = useState<number | null>(null);
  const [medicos, setMedicos] = useState<number>(0);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("presencia-online");

    const refresh = () => {
      const state = channel.presenceState() as Record<string, Array<{ rol?: string }>>;
      let p = 0;
      let m = 0;
      for (const metas of Object.values(state)) {
        if (metas[0]?.rol === "medico") m++;
        else p++;
      }
      setPacientes(p);
      setMedicos(m);
    };

    channel
      .on("presence", { event: "sync" }, refresh)
      .on("presence", { event: "join" }, refresh)
      .on("presence", { event: "leave" }, refresh)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const cargando = pacientes === null;

  return (
    <div className="rounded-xl bg-white p-4" style={{ border: "1px solid #e5e7eb" }}>
      <div className="flex items-center gap-2">
        <Wifi size={16} strokeWidth={1.75} style={{ color: cargando ? "#888780" : "#1D9E75" }} />
        <span className="text-xs font-medium text-gray-400">Navegando ahora</span>
        {!cargando && (
          <span className="ml-auto inline-block h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: "#1D9E75" }} />
        )}
      </div>
      {cargando ? (
        <p className="mt-2 text-2xl font-semibold text-gray-300">…</p>
      ) : (
        <div className="mt-2 flex items-baseline gap-4">
          <span className="flex items-baseline gap-1.5">
            <Users size={14} className="self-center text-gray-400" strokeWidth={1.75} />
            <span className="text-2xl font-semibold text-gray-900">{pacientes}</span>
            <span className="text-xs text-gray-400">pacientes</span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <Stethoscope size={14} className="self-center text-gray-400" strokeWidth={1.75} />
            <span className="text-2xl font-semibold text-gray-900">{medicos}</span>
            <span className="text-xs text-gray-400">médicos</span>
          </span>
        </div>
      )}
      <p className="mt-0.5 text-xs text-gray-400">usuarios únicos con la app abierta</p>
    </div>
  );
}
