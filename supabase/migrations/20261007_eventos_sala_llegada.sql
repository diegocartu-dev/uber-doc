-- APLICADA en producción el 07/10/2026 (OK de Diego), verificada en pg_constraint.
-- Solo en la base principal. Los eventos de llegada a la sala de espera:
-- sala_llegada (servidor/middleware) y sala_abierta (la pantalla).
ALTER TABLE public.eventos_funnel DROP CONSTRAINT eventos_funnel_evento_check;
ALTER TABLE public.eventos_funnel ADD CONSTRAINT eventos_funnel_evento_check CHECK (evento = ANY (ARRAY[
  'mp_oauth_view_tab','mp_oauth_start_click','mp_oauth_callback_success','mp_oauth_callback_error','mp_oauth_disconnect',
  'session_expired_detected','session_expired_background','pago_vista','pago_intento','pago_creado','pago_aprobado',
  'pago_rechazado','pago_refund','pago_chargeback','clinica_vista','medico_elegido','registro_medico_paso',
  'registro_medico_error','triage_paso','triage_bloqueado','rescate_ofrecido','rescate_elegido','permiso_notificaciones',
  'pago_toque','error_cliente','nova_widget_visto','nova_widget_click',
  'sala_llegada','sala_abierta']));
