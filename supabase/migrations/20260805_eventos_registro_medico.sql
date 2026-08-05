-- Instrumentación del registro médico (decisión Diego 04/08/2026).
-- Los 16 registros trabados de jul/ago murieron dentro del form de Fase B sin
-- dejar rastro del paso. Dos eventos nuevos en la whitelist del CHECK:
--   registro_medico_paso  → metadata {paso: 1|2|3, user_id}
--   registro_medico_error → metadata {donde, motivo, user_id}
-- (medico_id va NULL: en Fase B la ficha todavía no existe; user_id en metadata.)

ALTER TABLE eventos_funnel DROP CONSTRAINT eventos_funnel_evento_check;

ALTER TABLE eventos_funnel ADD CONSTRAINT eventos_funnel_evento_check
  CHECK (evento = ANY (ARRAY[
    'mp_oauth_view_tab'::text,
    'mp_oauth_start_click'::text,
    'mp_oauth_callback_success'::text,
    'mp_oauth_callback_error'::text,
    'mp_oauth_disconnect'::text,
    'session_expired_detected'::text,
    'session_expired_background'::text,
    'pago_creado'::text,
    'pago_aprobado'::text,
    'pago_rechazado'::text,
    'pago_refund'::text,
    'pago_chargeback'::text,
    'clinica_vista'::text,
    'medico_elegido'::text,
    'registro_medico_paso'::text,
    'registro_medico_error'::text
  ]));
