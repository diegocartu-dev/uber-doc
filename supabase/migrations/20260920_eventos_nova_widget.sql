-- ¿Ven la tarjeta de Nova y no la tocan, o directamente no la ven? (20/09/2026)
--
-- Medición del 20/09: más de la mitad de los profesionales aprobados nunca
-- abrió Nova, y casi dos tercios de ellos SÍ entraron a Docto en los últimos
-- 30 días. Con eso sabemos que entran, pero no si la tarjeta les aparece en
-- pantalla. Desde el servidor, "no llegó a verla" y "la vio y no le interesó"
-- dejan la MISMA huella: ninguna. Y son dos problemas distintos con dos
-- soluciones distintas.
--
-- `nova_widget_visto`: la tarjeta se montó en su pantalla.
-- `nova_widget_click`: tocó el botón.
--
-- Los dos viajan con `metadata.estado` = qué se le estaba ofreciendo
-- (sin_agenda / sin_ci / al_dia), así se puede ver cuál de las tres ofertas
-- convence y cuál no.
--
-- El nombre del constraint se leyó de pg_constraint, no se supuso: un DROP
-- sobre un nombre inventado no falla y deja el viejo vivo.
ALTER TABLE eventos_funnel DROP CONSTRAINT eventos_funnel_evento_check;
ALTER TABLE eventos_funnel ADD CONSTRAINT eventos_funnel_evento_check CHECK (
  evento = ANY (ARRAY[
    'mp_oauth_view_tab','mp_oauth_start_click','mp_oauth_callback_success',
    'mp_oauth_callback_error','mp_oauth_disconnect','session_expired_detected',
    'session_expired_background','pago_vista','pago_intento','pago_creado',
    'pago_aprobado','pago_rechazado','pago_refund','pago_chargeback',
    'clinica_vista','medico_elegido','registro_medico_paso','registro_medico_error',
    'triage_paso','triage_bloqueado','rescate_ofrecido','rescate_elegido',
    'permiso_notificaciones','pago_toque','error_cliente',
    'nova_widget_visto','nova_widget_click'
  ])
);
