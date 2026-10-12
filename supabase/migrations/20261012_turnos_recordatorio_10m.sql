-- Recordatorio al paciente 10 minutos antes del turno (arreglo 12/10/2026).
--
-- El cron `recordatorios-10min` existía pero nunca se agendó, y además buscaba
-- con la hora del servidor (UTC) turnos guardados en hora argentina. Al
-- agendarlo hace falta saber a quién ya se le mandó, para que corriendo cada
-- minuto el aviso salga UNA vez. Mismo criterio que `recordatorio_24h_enviado`,
-- pero con la hora: dice además cuándo salió.
--
-- La tabla `turnos` tiene GRANT a nivel tabla para `authenticated`, así que una
-- columna nueva no rompe ningún SELECT existente.

ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS recordatorio_10m_at TIMESTAMPTZ;

COMMENT ON COLUMN public.turnos.recordatorio_10m_at IS
  'Cuándo salió el recordatorio de 10 minutos al paciente (cron recordatorios-10min). NULL = no salió.';
