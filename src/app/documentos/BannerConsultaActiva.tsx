"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function BannerConsultaActiva({ consultaId }: { consultaId: string }) {
  const [completada, setCompletada] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`docs-espera-${consultaId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "consultas", filter: `id=eq.${consultaId}` },
        (payload) => {
          const nuevo = payload.new as { estado: string };
          if (nuevo.estado === "completada") {
            setCompletada(true);
            setTimeout(() => window.location.reload(), 2000);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [consultaId]);

  if (completada) {
    return (
      <div
        className="mb-6 rounded-xl bg-[#1D9E75] p-4 text-center text-sm text-white"
      >
        ✅ ¡Tu consulta finalizó! Cargando documentos...
      </div>
    );
  }

  return (
    <div
      className="mb-6 rounded-xl p-4 text-center text-sm text-gray-600"
      style={{ border: "0.5px solid #e5e7eb", background: "#fffbeb" }}
    >
      Si no ves tus documentos todavía, el médico puede estar finalizando la consulta. Esta página se actualiza automáticamente.
    </div>
  );
}
