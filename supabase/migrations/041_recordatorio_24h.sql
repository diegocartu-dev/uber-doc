ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS recordatorio_24h_enviado BOOLEAN DEFAULT false;
