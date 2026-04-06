-- Columna para auto-save de borradores de documentación clínica
-- Guarda: { diagnostico, receta, indicaciones, certificado, updated_at }
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS doc_borrador JSONB DEFAULT NULL;
ALTER TABLE public.turnos ADD COLUMN IF NOT EXISTS doc_borrador JSONB DEFAULT NULL;
