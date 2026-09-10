-- La caja negra de la sala de espera (decisión Diego, 10/09/2026).
--
-- Diagnóstico del 09/09: una paciente estuvo 2,5 minutos con el botón de pago
-- a la vista y el servidor no recibió nada. Desde el servidor, "no tocó el
-- botón" y "tocó y su navegador falló antes de mandar nada" dejan la MISMA
-- huella: ninguna. Dos eventos nuevos, emitidos por el navegador del paciente:
--
-- `pago_toque`: tocó el botón de pagar. Se emite por beacon ANTES de hacer
-- cualquier otra cosa, así sobrevive aunque el resto falle. Con `pago_vista`
-- (vio el botón; ya existía, ahora también desde el cliente) y `pago_intento`
-- (llegó al servidor) el recorrido queda completo.
--
-- `error_cliente`: un error del navegador (excepción, promesa rechazada, fallo
-- del poll o del pago, o el error boundary global) que hasta hoy moría en la
-- consola del teléfono del usuario.
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
    'permiso_notificaciones',
    'pago_toque','error_cliente'
  ])
);
