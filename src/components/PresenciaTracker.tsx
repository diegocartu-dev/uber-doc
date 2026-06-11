"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Tracker de presencia en vivo — Supabase Realtime Presence.
 *
 * Se monta en las páginas con usuario logueado (AppNavbar + dashboard médico)
 * y anuncia al usuario en el canal `presencia-online` con su rol. El admin
 * (OnlineAhora.tsx) se suscribe al mismo canal SIN trackear y cuenta cuántos
 * pacientes/médicos están navegando ahora.
 *
 * Key de presencia = user.id → un usuario con 2 pestañas cuenta una sola vez.
 * No persiste nada en DB; si Realtime se cae, falla en silencio (es solo
 * telemetría, nunca bloquear UX por esto).
 */
export default function PresenciaTracker({ rol }: { rol: "paciente" | "medico" }) {
  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelado = false;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelado) return;

        channel = supabase.channel("presencia-online", {
          config: { presence: { key: user.id } },
        });

        channel.subscribe(async (status) => {
          if (status === "SUBSCRIBED" && channel) {
            await channel.track({ rol, at: new Date().toISOString() }).catch(() => {});
          }
        });
      } catch {
        // Silencioso: la presencia nunca debe romper la página.
      }
    })();

    return () => {
      cancelado = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [rol]);

  return null;
}
