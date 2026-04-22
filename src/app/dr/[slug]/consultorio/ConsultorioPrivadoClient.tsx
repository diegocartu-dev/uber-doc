"use client";

import { useRouter } from "next/navigation";

type Props = {
  medicoId: string;
  especialidad: string;
  slug: string;
  puedeInmediata: boolean;
};

export default function ConsultorioPrivadoClient({
  medicoId,
  especialidad,
  slug,
  puedeInmediata,
}: Props) {
  const router = useRouter();

  return (
    <div className="mt-5 space-y-3">
      {/* Consulta ahora — redirige al triage con canal consultorio_privado */}
      <button
        disabled={!puedeInmediata}
        onClick={() => {
          router.push(
            `/triage?medicoId=${encodeURIComponent(medicoId)}&especialidad=${encodeURIComponent(especialidad)}&canal=consultorio_privado&from=/dr/${slug}/consultorio`
          );
        }}
        className="w-full rounded-[var(--radius-md)] py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.97] transition-all duration-100"
        style={{ backgroundColor: puedeInmediata ? "var(--color-primary)" : "var(--color-muted)" }}
      >
        Consulta ahora
      </button>

      {/* Agendar turno */}
      <button
        onClick={() => {
          router.push(`/clinica/${medicoId}/turnos?canal=consultorio_privado&from=/dr/${slug}/consultorio`);
        }}
        className="w-full rounded-[var(--radius-md)] py-3 text-sm font-medium transition-colors hover:bg-[var(--color-bg-tertiary)]"
        style={{
          border: "1px solid var(--color-border-strong)",
          color: "var(--color-text-secondary)",
        }}
      >
        Agendar turno
      </button>
    </div>
  );
}
