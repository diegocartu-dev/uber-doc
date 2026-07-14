-- Throttle del mail recordatorio de verificación de identidad al médico
-- (gate sin muro, 13/07/2026): máximo 1 mail cada 72 h por médico. La escribe
-- solo el cron reconciliar-identidad (service role); sin GRANT a authenticated
-- (regla post-outage: columnas nuevas de medicos nunca en selects RLS).
ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS identidad_recordatorio_at TIMESTAMPTZ;
