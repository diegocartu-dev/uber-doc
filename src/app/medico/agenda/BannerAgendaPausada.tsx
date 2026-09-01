"use client";

// La agenda quedó DESPUBLICADA por un turno pago que no se atendió (T8 rescate,
// decisión Diego 31/08). Este banner es la única forma de enterarse mirando la
// agenda —el mensaje interno puede no leerse— y la reactivación es UN toque:
// la sanción busca que no le pase lo mismo a otro paciente, no trabar al
// profesional que ya está de vuelta frente a la pantalla.

import { useState, useTransition } from "react";
import { reactivarAgenda } from "./actions";

export default function BannerAgendaPausada() {
  const [reactivada, setReactivada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (reactivada) {
    return (
      <div className="mx-4 mt-4 rounded-xl border border-[#1D9E75]/30 bg-[#1D9E75]/5 p-4 md:mx-6">
        <p className="text-sm font-semibold" style={{ color: "#1D9E75" }}>
          Agenda publicada de nuevo
        </p>
        <p className="mt-1 text-sm text-gray-600">Tus turnos libres ya vuelven a ofrecerse.</p>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-4 rounded-xl border p-4 md:mx-6" style={{ borderColor: "#D85A30", backgroundColor: "rgba(216,90,48,0.06)" }}>
      <p className="text-sm font-semibold" style={{ color: "#D85A30" }}>
        Tu agenda está pausada
      </p>
      <p className="mt-1 text-sm text-gray-700">
        Un turno pago quedó sin atender y le devolvimos el dinero al paciente, así que
        dejamos de ofrecer tus turnos libres. Los que ya estaban reservados siguen en pie.
      </p>
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await reactivarAgenda();
            if (r.ok) setReactivada(true);
            else setError("No se pudo reactivar. Probá de nuevo o escribinos.");
          });
        }}
        disabled={pending}
        className="mt-3 rounded-xl bg-[#378ADD] px-5 py-2.5 text-sm font-semibold text-white active:scale-[0.97] transition-all duration-100 disabled:opacity-60"
      >
        {pending ? "Reactivando..." : "Volver a publicar mi agenda"}
      </button>
      {error && <p className="mt-2 text-sm" style={{ color: "#E24B4A" }}>{error}</p>}
    </div>
  );
}
