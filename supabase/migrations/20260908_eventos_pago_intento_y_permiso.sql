-- Dos eventos nuevos, del caso del 08/09 (una consulta aceptada en 25 segundos
-- que nunca se pagó, y no se pudo saber por qué):
--
-- `pago_intento`: se emite ANTES de llamar a Mercado Pago. Hasta hoy solo
-- existía `pago_creado`, que se emite DESPUÉS de que MP responde bien — así que
-- un checkout que falla no deja ningún rastro y "no apretó pagar" es
-- indistinguible de "apretó y se rompió".
--
-- `permiso_notificaciones`: qué contestó el paciente cuando le pedimos permiso
-- de avisos al elegir profesional (concedido / rechazado / imposible en este
-- dispositivo). Sin esto no se puede medir la cobertura del canal.
ALTER TABLE eventos_funnel DROP CONSTRAINT eventos_funnel_evento_check;
ALTER TABLE eventos_funnel ADD CONSTRAINT eventos_funnel_evento_check CHECK (
  evento = ANY (ARRAY[
    'mp_oauth_view_tab','mp_oauth_start_click','mp_oauth_callback_success',
    'mp_oauth_callback_error','mp_oauth_disconnect',
    'session_expired_detected','session_expired_background',
    'pago_vista','pago_intento','pago_creado','pago_aprobado','pago_rechazado',
    'pago_refund','pago_chargeback',
    'clinica_vista','medico_elegido',
    'registro_medico_paso','registro_medico_error',
    'triage_paso','triage_bloqueado',
    'rescate_ofrecido','rescate_elegido',
    'permiso_notificaciones'
  ])
);
