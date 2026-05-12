"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NovaToggle({
  medicoId,
  initialValue,
}: {
  medicoId: string;
  initialValue: boolean;
}) {
  const [activa, setActiva] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !activa;
    setSaving(true);
    setActiva(next);

    const supabase = createClient();
    const { error } = await supabase
      .from("medicos")
      .update({ nova_evolucion_activa: next })
      .eq("id", medicoId);

    if (error) {
      setActiva(!next);
    }
    setSaving(false);
  }

  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-gray-400">
        ASISTENCIA DE NOVA EN CONSULTAS
      </p>
      <p className="mt-2 text-sm text-gray-600" style={{ lineHeight: "1.5" }}>
        Nova escucha tu consulta y te propone un borrador de Evolución al
        finalizar. Podés editarlo antes de guardarlo.
      </p>

      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className="mt-4 flex items-center gap-3"
        style={{ minHeight: "44px" }}
      >
        <div
          className="relative transition-colors duration-200"
          style={{
            width: 48,
            height: 26,
            borderRadius: 13,
            backgroundColor: activa ? "#378ADD" : "#d1d5db",
          }}
        >
          <div
            className="absolute top-[3px] transition-all duration-200"
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: "white",
              left: activa ? 25 : 3,
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
          />
        </div>
        <span className="text-sm font-medium text-gray-700">
          {activa ? "Activada" : "Desactivada"}
        </span>
      </button>
    </div>
  );
}
