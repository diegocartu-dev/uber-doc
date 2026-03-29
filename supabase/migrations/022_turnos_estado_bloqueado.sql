ALTER TABLE public.turnos DROP CONSTRAINT IF EXISTS turnos_estado_check;
ALTER TABLE public.turnos ADD CONSTRAINT turnos_estado_check
  CHECK (estado IN ('disponible', 'reservado', 'cancelado', 'completado', 'bloqueado'));
