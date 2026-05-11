import { createAdminClient } from "@/lib/supabase/admin";

type EventoFunnel =
  | "mp_oauth_view_tab"
  | "mp_oauth_start_click"
  | "mp_oauth_callback_success"
  | "mp_oauth_callback_error"
  | "mp_oauth_disconnect";

export async function trackEvent(params: {
  evento: EventoFunnel;
  medicoId?: string | null;
  pacienteId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("eventos_funnel").insert({
      evento: params.evento,
      medico_id: params.medicoId ?? null,
      paciente_id: params.pacienteId ?? null,
      metadata: params.metadata ?? {},
    });
  } catch {
    console.error("Error tracking funnel event:", params.evento);
  }
}
