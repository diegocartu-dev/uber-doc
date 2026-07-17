-- Aviso de agenda vencida (decisión Diego 17/07): candado "una sola vez" del
-- cron /api/cron/aviso-agenda-vencida. Se marca al enviar el aviso (o al
-- determinar que no correspondía). Solo la toca el service role — sin grants
-- nuevos para authenticated.
ALTER TABLE public.agenda_modelos
  ADD COLUMN IF NOT EXISTS aviso_vencimiento_enviado_at timestamptz;
