-- Agregar eventos de pago al CHECK constraint de eventos_funnel
-- Requerido por Fix 3 (webhook trackEvent) y Fix 5 (crear-v2 trackEvent)

ALTER TABLE eventos_funnel DROP CONSTRAINT IF EXISTS eventos_funnel_evento_check;

ALTER TABLE eventos_funnel ADD CONSTRAINT eventos_funnel_evento_check CHECK (
  evento = ANY (ARRAY[
    'mp_oauth_view_tab',
    'mp_oauth_start_click',
    'mp_oauth_callback_success',
    'mp_oauth_callback_error',
    'mp_oauth_disconnect',
    'session_expired_detected',
    'session_expired_background',
    'pago_creado',
    'pago_aprobado',
    'pago_rechazado',
    'pago_refund',
    'pago_chargeback'
  ])
);

COMMENT ON CONSTRAINT eventos_funnel_evento_check ON eventos_funnel IS
  'Whitelist de eventos permitidos — actualizado 2026-05-15 con eventos de pago marketplace';
