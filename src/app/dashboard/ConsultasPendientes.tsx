"use client";

import { useState, useTransition } from "react";
import { aceptarConsulta } from "@/app/sala-espera/[consultaId]/actions";
import { TouchButton } from "@/components/TouchButton";
import OrigenBadge from "@/components/OrigenBadge";
import { useDashboardMedico } from "./DashboardMedicoProvider";
import { capitalizarNombre } from "@/lib/utils/texto";

type Consulta = {
  id: string;
  especialidad: string;
  estado: string;
  created_at: string;
  paciente_nombre: string;
  paciente_tabla_id: string | null;
  motivo_consulta: string | null;
  fecha_nacimiento: string | null;
  canal_origen?: string;
};

function calcularEdad(fechaNac: string | null): string {
  if (!fechaNac) return "";
  const hoy = new Date();
  const nac = new Date(fechaNac);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} años`;
}

function tiempoEspera(fecha: string): string {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function ConsultasPendientes({ medicoId, activa }: { medicoId: string; activa?: boolean }) {
  const { pendientes } = useDashboardMedico();
  const [localRemoved, setLocalRemoved] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  // Filter out locally-accepted consultas until the next poll refreshes
  const consultas = pendientes.filter((c) => !localRemoved.has(c.id));

  function handleAceptar(consultaId: string) {
    startTransition(async () => {
      await aceptarConsulta(consultaId);
      setLocalRemoved((prev) => new Set(prev).add(consultaId));
    });
  }

  if (consultas.length === 0) return (
    <div
      className="rounded-xl px-5 py-8 text-center"
      style={activa
        ? { background: "rgba(29, 158, 117, 0.04)", border: "0.5px solid #e5e7eb" }
        : { border: "0.5px solid #e5e7eb" }
      }
    >
      <p className={`text-sm ${activa ? "text-[#1D9E75] font-medium" : "text-gray-400"}`}>
        {activa ? "Disponible para consultas" : "Sin pacientes en espera"}
      </p>
    </div>
  );

  return (
    <div className="rounded-xl border-l-4 border-[#D85A30] bg-white p-6" style={{ borderTop: "0.5px solid #e5e7eb", borderRight: "0.5px solid #e5e7eb", borderBottom: "0.5px solid #e5e7eb" }}>
      <p className="text-sm font-medium tracking-wide text-[#D85A30]">PACIENTES EN ESPERA</p>

      <div className="mt-4 space-y-3">
        {consultas.map((c) => {
          const nombre = capitalizarNombre(c.paciente_nombre);
          const edad = calcularEdad(c.fecha_nacimiento);
          const espera = tiempoEspera(c.created_at);
          const initials = getInitials(nombre);

          return (
            <div key={c.id} className="flex flex-col gap-2 rounded-lg p-4 transition hover:bg-gray-50 sm:flex-row sm:items-center sm:gap-4">
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500 sm:flex">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  {c.paciente_tabla_id ? (
                    <a href={`/medico/paciente/${c.paciente_tabla_id}`} className="text-base font-medium text-gray-900 hover:text-[#378ADD]">{nombre}</a>
                  ) : (
                    <p className="text-base font-medium text-gray-900">{nombre}</p>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-sm text-gray-500">
                    {[edad, c.especialidad].filter(Boolean).join(" · ")}
                  </span>
                  <OrigenBadge canalOrigen={c.canal_origen ?? null} />
                </div>
                {c.motivo_consulta && (
                  <p className="mt-0.5 truncate text-sm text-gray-600 sm:text-xs">
                    {c.motivo_consulta}
                  </p>
                )}
              </div>
              {espera && <span className="hidden shrink-0 text-xs text-gray-400 sm:block">{espera}</span>}
              <TouchButton
                disabled={isPending}
                onClick={() => handleAceptar(c.id)}
                className="w-full shrink-0 rounded-lg bg-gray-100 px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 sm:w-auto min-h-[44px]"
              >
                {isPending ? "..." : "Aceptar"}
              </TouchButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}
