-- Unique constraint para evitar slots duplicados en la misma fecha/hora para un médico.
-- Necesario para que el cron de generación de slots use ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS turnos_medico_fecha_hora_uq
  ON public.turnos (medico_id, fecha, hora_inicio);
