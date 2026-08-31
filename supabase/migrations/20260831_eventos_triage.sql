-- El triage era el punto ciego del recorrido del paciente: entre elegir un
-- profesional y que exista el pedido hay un muro de términos (scroll obligatorio
-- + dos casillas) y después el formulario. Quien se caía en uno o en otro no
-- dejaba rastro, y las dos cosas se leían igual: "eligió y no pidió".
--
-- `eventos_funnel.evento` tiene una whitelist por CHECK, así que un evento nuevo
-- se rechaza en la base aunque el código lo emita.
ALTER TABLE eventos_funnel DROP CONSTRAINT IF EXISTS eventos_funnel_evento_check;

ALTER TABLE eventos_funnel ADD CONSTRAINT eventos_funnel_evento_check CHECK (
  evento = ANY (ARRAY[
    'mp_oauth_view_tab', 'mp_oauth_start_click', 'mp_oauth_callback_success',
    'mp_oauth_callback_error', 'mp_oauth_disconnect',
    'session_expired_detected', 'session_expired_background',
    'pago_vista', 'pago_creado', 'pago_aprobado', 'pago_rechazado',
    'pago_refund', 'pago_chargeback',
    'clinica_vista', 'medico_elegido',
    'registro_medico_paso', 'registro_medico_error',
    -- NUEVOS: dónde se cae el paciente adentro del triage.
    --   triage_paso      → metadata.paso = terminos | formulario | confirmacion
    --   triage_bloqueado → metadata.motivo = emergencia | encuentro_pagado |
    --                      cambio_profesional | error (+ detalle)
    'triage_paso', 'triage_bloqueado'
  ])
);
