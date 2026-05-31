-- Ticket 2B: Agregar fee_pendiente al CHECK de reintegro_estado
-- Estado parcial: pata médico OK pero reversión del fee de Docto falló (reintentable)
ALTER TABLE public.turnos DROP CONSTRAINT IF EXISTS turnos_reintegro_estado_check;
ALTER TABLE public.turnos ADD CONSTRAINT turnos_reintegro_estado_check
  CHECK (reintegro_estado IN ('pendiente', 'usado_reprogramacion', 'reembolsado', 'fee_pendiente'));
