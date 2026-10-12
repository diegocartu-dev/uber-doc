-- Recordatorio al paciente 10 minutos antes del turno (arreglo 12/10/2026).
--
-- El cron `recordatorios-10min` existía pero nunca se agendó, y además buscaba
-- con la hora del servidor (UTC) turnos guardados en hora argentina. Al
-- agendarlo hace falta saber a quién ya se le mandó, para que corriendo cada
-- minuto el aviso salga UNA vez. Mismo criterio que `recordatorio_24h_enviado`,
-- pero con la hora.
--
-- OJO al leerla: NO es evidencia de que el paciente recibió el aviso. Se marca
-- ANTES de mandar (para que dos corridas no lo dupliquen) y también cuando el
-- paciente no pidió el aviso de 10 min. Si no llegó por ningún canal, el cron
-- la devuelve a NULL y reintenta.
--
-- La tabla `turnos` tiene GRANT a nivel tabla para `authenticated`, así que una
-- columna nueva no rompe ningún SELECT existente.

ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS recordatorio_10m_at TIMESTAMPTZ;

COMMENT ON COLUMN public.turnos.recordatorio_10m_at IS
  'Cuándo el cron recordatorios-10min procesó el turno (mandó el aviso, o el paciente no lo había pedido). NO prueba que el aviso llegó. NULL = no se procesó.';
