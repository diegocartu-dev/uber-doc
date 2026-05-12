-- Ampliar CHECK constraint de eventos_funnel para incluir eventos de sesión
-- Sprint: Sesiones Robustas para Médicos en CI

ALTER TABLE eventos_funnel
  DROP CONSTRAINT IF EXISTS eventos_funnel_evento_check;

ALTER TABLE eventos_funnel
  ADD CONSTRAINT eventos_funnel_evento_check CHECK (evento IN (
    'mp_oauth_view_tab',
    'mp_oauth_start_click',
    'mp_oauth_callback_success',
    'mp_oauth_callback_error',
    'mp_oauth_disconnect',
    'session_expired_detected',
    'session_expired_background'
  ));
