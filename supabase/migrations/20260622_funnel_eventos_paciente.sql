-- 20260622_funnel_eventos_paciente.sql
-- Instrumentación del funnel del PACIENTE (antes solo se medían eventos del médico:
-- MP OAuth + pagos). Sumamos dos eventos del recorrido temprano del paciente, que
-- es justo el punto ciego (registrado → ??? → consultó):
--   - clinica_vista   : el paciente entró a la grilla de la Clínica Virtual.
--   - medico_elegido  : el paciente eligió un médico (CI o turno).
-- El resto del recorrido ya es derivable: registro/perfil de `pacientes`,
-- "inició pago" de `pago_creado` (ya existe), "pagó/atendió" de `consultas`.
--
-- Cambio puramente ADITIVO al CHECK whitelist (no puede romper datos existentes).
-- La columna paciente_id ya existe en eventos_funnel.

ALTER TABLE eventos_funnel DROP CONSTRAINT eventos_funnel_evento_check;

ALTER TABLE eventos_funnel ADD CONSTRAINT eventos_funnel_evento_check CHECK (
  evento = ANY (ARRAY[
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
    'medico_elegido'::text
  ])
);
