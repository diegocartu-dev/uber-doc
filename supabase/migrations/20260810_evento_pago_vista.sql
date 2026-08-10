-- Evento nuevo del funnel: el paciente VIO la pantalla de pago de un turno.
--
-- Por qué (caso del 10/08): una paciente reservó un turno y nunca lo pagó.
-- Sabíamos que reservó (queda la fila del turno) y que nunca apretó pagar (no
-- hay `pago_creado`), pero NO si llegó a ver la pantalla de pago, cuánto estuvo
-- ni si algo la expulsó. La distancia entre `pago_vista` y `pago_creado` es el
-- abandono del checkout, y hoy es invisible.
--
-- `eventos_funnel` valida los eventos con un CHECK (regla del repo: evento
-- nuevo = migración que amplía la whitelist).
ALTER TABLE public.eventos_funnel DROP CONSTRAINT eventos_funnel_evento_check;
ALTER TABLE public.eventos_funnel ADD CONSTRAINT eventos_funnel_evento_check CHECK (
  evento = ANY (ARRAY[
    'mp_oauth_view_tab'::text,
    'mp_oauth_start_click'::text,
    'mp_oauth_callback_success'::text,
    'mp_oauth_callback_error'::text,
    'mp_oauth_disconnect'::text,
    'session_expired_detected'::text,
    'session_expired_background'::text,
    'pago_vista'::text,
    'pago_creado'::text,
    'pago_aprobado'::text,
    'pago_rechazado'::text,
    'pago_refund'::text,
    'pago_chargeback'::text,
    'clinica_vista'::text,
    'medico_elegido'::text,
    'registro_medico_paso'::text,
    'registro_medico_error'::text
  ])
);
