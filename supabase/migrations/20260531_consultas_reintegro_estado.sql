-- Ticket 2C: Agregar reintegro_estado a consultas (hoy solo existe en turnos)
-- Permite trackear estado del refund cuando un médico cancela una CI pagada
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS reintegro_estado text
    CHECK (reintegro_estado IN ('pendiente', 'reembolsado', 'fee_pendiente'));
