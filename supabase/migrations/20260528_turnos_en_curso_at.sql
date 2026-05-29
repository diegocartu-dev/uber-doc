-- Agrega en_curso_at a turnos para registrar el momento exacto en que
-- el médico inicia la videollamada. Consultas ya tiene esta columna
-- (migración 053). Se usa como referencia del timer en ambas vistas
-- (médico y paciente) para que ambos muestren el mismo tiempo.
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS en_curso_at TIMESTAMPTZ;
