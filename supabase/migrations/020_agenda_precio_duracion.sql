ALTER TABLE public.agenda_modelos ADD COLUMN IF NOT EXISTS duracion_turno integer DEFAULT 20;
ALTER TABLE public.agenda_modelos ADD COLUMN IF NOT EXISTS precio integer;
