import { createAdminClient } from "@/lib/supabase/admin";

type EventoFunnel =
  | "mp_oauth_view_tab"
  | "mp_oauth_start_click"
  | "mp_oauth_callback_success"
  | "mp_oauth_callback_error"
  | "mp_oauth_disconnect"
  // El paciente VIO la pantalla de pago (todavía no apretó pagar). La distancia
  // entre este evento y `pago_creado` es el abandono del checkout — antes era
  // invisible: sabíamos que alguien reservó (queda la fila del turno) pero no
  // si llegó a ver la pantalla de pago ni si la vio y se fue.
  | "pago_vista"
  | "pago_creado"
  | "pago_aprobado"
  | "pago_rechazado"
  | "pago_refund"
  | "pago_chargeback"
  // Recorrido del paciente (funnel temprano)
  | "clinica_vista"
  | "medico_elegido"
  // El TRIAGE era el punto ciego del recorrido: entre elegir profesional y
  // que exista el pedido hay un muro de términos (con scroll obligatorio y dos
  // casillas) y recién después el formulario. Sin estos dos eventos, un
  // paciente que se caía ahí no dejaba ningún rastro y la única lectura posible
  // era "eligió y no pidió", sin saber DÓNDE se fue.
  | "triage_paso"
  | "triage_bloqueado"
  // Menú de rescate (sprint 31/08). `rescate_ofrecido` lo emite el SERVIDOR al
  // servir alternativas (metadata: momento, cuántas opciones, si había de la
  // misma especialidad — con opciones.n=0 también: "no tuvimos qué ofrecer" es
  // dato). `rescate_elegido` lo emite el cliente al tocar una card. El éxito
  // sigue siendo el pago (regla de Fede): un tap es diagnóstico, no éxito.
  | "rescate_ofrecido"
  | "rescate_elegido"
  // Registro del médico (Fase B). Ya se emitían; faltaban en este tipo.
  | "registro_medico_paso"
  | "registro_medico_error";

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
  } catch (err) {
    console.error("Error tracking funnel event:", params.evento, err);
  }
}
