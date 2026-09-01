-- Medición del menú de rescate (sprint 31/08). `rescate_ofrecido` = el sistema
-- mostró alternativas tras una caída (momento, cuántas opciones, si había de la
-- misma especialidad; con n=0 también — "no tuvimos qué ofrecer" es dato).
-- `rescate_elegido` = el paciente tocó una card. El éxito se mide por pago,
-- nunca por tap. La whitelist por CHECK exige ampliarse ANTES de que el código
-- emita, o la base rechaza en silencio.
ALTER TABLE eventos_funnel DROP CONSTRAINT eventos_funnel_evento_check;
ALTER TABLE eventos_funnel ADD CONSTRAINT eventos_funnel_evento_check CHECK (
  evento = ANY (ARRAY[
    'mp_oauth_view_tab', 'mp_oauth_start_click', 'mp_oauth_callback_success',
    'mp_oauth_callback_error', 'mp_oauth_disconnect',
    'session_expired_detected', 'session_expired_background',
    'pago_vista', 'pago_creado', 'pago_aprobado', 'pago_rechazado',
    'pago_refund', 'pago_chargeback',
    'clinica_vista', 'medico_elegido',
    'registro_medico_paso', 'registro_medico_error',
    'triage_paso', 'triage_bloqueado',
    'rescate_ofrecido', 'rescate_elegido'
  ])
);
