-- Sprint Legal Item 5: Retención de historia clínica 10 años (Ley 26.529 art. 18)
-- Cambiar cascade delete en consultas.paciente_id para evitar borrado de HC
-- Agregar campos de pseudonimización y retención legal en pacientes

-- 1. Cambiar FK de consultas.paciente_id de CASCADE a RESTRICT
ALTER TABLE public.consultas
  DROP CONSTRAINT IF EXISTS consultas_paciente_id_fkey;

ALTER TABLE public.consultas
  ADD CONSTRAINT consultas_paciente_id_fkey
  FOREIGN KEY (paciente_id) REFERENCES auth.users(id)
  ON DELETE RESTRICT;

-- 2. Agregar soft delete y retención legal en pacientes
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS dado_de_baja BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dado_de_baja_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anonimizado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anonimizado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retencion_legal_hasta DATE;

-- 3. Índice para consultas de pacientes dados de baja
CREATE INDEX IF NOT EXISTS idx_pacientes_baja
  ON public.pacientes(dado_de_baja)
  WHERE dado_de_baja = true;
