-- Aviso de agenda vencida (decisión Diego 17/07): candado "una sola vez" del
-- cron /api/cron/aviso-agenda-vencida. Se marca al enviar el aviso (o al
-- determinar que no correspondía). Solo el cron la escribe en la práctica;
-- agenda_modelos tiene grants a NIVEL TABLA (no por columna), así que la columna
-- queda cubierta automáticamente y ningún select("*") existente se rompe
-- (precisión gate Roberto #283 — dato no sensible, riesgo cero).
ALTER TABLE public.agenda_modelos
  ADD COLUMN IF NOT EXISTS aviso_vencimiento_enviado_at timestamptz;
