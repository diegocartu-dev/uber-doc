-- BUG B Fix: documentos de turnos programados no se guardan
-- La tabla documentos solo tenia consulta_id NOT NULL, sin columna turno_id.
-- Los documentos de turnos necesitan turno_id y consulta_id nullable.

-- Hacer consulta_id nullable (documentos de turnos no tienen consulta)
ALTER TABLE public.documentos ALTER COLUMN consulta_id DROP NOT NULL;

-- Agregar columna turno_id
ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS turno_id uuid REFERENCES public.turnos(id) ON DELETE CASCADE;

-- Garantizar que al menos uno de los dos este presente
ALTER TABLE public.documentos
  ADD CONSTRAINT documentos_origen_check
  CHECK (consulta_id IS NOT NULL OR turno_id IS NOT NULL);
