"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function EsperaVideo({
  consultaId,
  salaVideoUrlInicial,
}: {
  consultaId: string;
  salaVideoUrlInicial: string | null;
}) {
  const [salaUrl, setSalaUrl] = useState(salaVideoUrlInicial);

  useEffect(() => {
    if (salaUrl) return;

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      channel = supabase
        .channel(`espera-video-${consultaId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "consultas", filter: `id=eq.${consultaId}` },
          (payload) => {
            const updated = payload.new as {
              sala_video_url: string | null;
            };
            if (updated.sala_video_url) {
              setSalaUrl(updated.sala_video_url);
            }
          }
        )
        .subscribe();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [consultaId, salaUrl]);

  if (salaUrl) {
    return (
      <a
        href={`/consulta/${consultaId}/video`}
        className="block w-full rounded-xl bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
      >
        Unirse a la videollamada
      </a>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-4 text-center">
      <div className="flex items-center justify-center gap-2">
        <svg
          className="h-4 w-4 animate-spin text-gray-400"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <p className="text-sm text-gray-500">
          Esperando que el médico inicie la videollamada...
        </p>
      </div>
    </div>
  );
}
