"use client";

import { useTransition } from "react";
import { aceptarConsulta } from "@/app/sala-espera/[consultaId]/actions";

type Consulta = {
  id: string;
  especialidad: string;
  estado: string;
  created_at: string;
  paciente_nombre: string;
};

function tiempoDesde(fecha: string) {
  const diff = Date.now() - new Date(fecha).getTime();
  const minutos = Math.floor(diff / 60000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  return `hace ${Math.floor(minutos / 60)} h`;
}

export default function ConsultasPendientes({
  consultas,
}: {
  consultas: Consulta[];
}) {
  const [isPending, startTransition] = useTransition();

  if (consultas.length === 0) {
    return null;
  }

  function handleAceptar(consultaId: string) {
    startTransition(async () => {
      await aceptarConsulta(consultaId);
      window.location.reload();
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">
        Pacientes en espera
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        {consultas.length} paciente{consultas.length !== 1 ? "s" : ""}{" "}
        esperando tu atención
      </p>

      <div className="mt-4 space-y-3">
        {consultas.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-lg border border-gray-100 p-4"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">
                {c.paciente_nombre}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {c.especialidad} · {tiempoDesde(c.created_at)}
              </p>
            </div>
            <button
              disabled={isPending}
              onClick={() => handleAceptar(c.id)}
              className="shrink-0 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isPending ? "..." : "Aceptar"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
