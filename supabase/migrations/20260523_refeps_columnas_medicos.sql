-- ============================================================================
-- Migración: Columnas REFEPS en tabla medicos
-- Sprint: REFEPS — validación de matrícula vía Bus de Interoperabilidad
-- Fecha: 2026-05-23
-- ============================================================================
-- Agrega 3 columnas para almacenar el resultado de la validación REFEPS:
--   - refeps_validado: boolean (¿fue validado contra REFEPS?)
--   - refeps_data: jsonb (respuesta FHIR Practitioner completa)
--   - refeps_validado_at: timestamptz (cuándo se validó)
-- ============================================================================

ALTER TABLE medicos
  ADD COLUMN IF NOT EXISTS refeps_validado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS refeps_data JSONB,
  ADD COLUMN IF NOT EXISTS refeps_validado_at TIMESTAMPTZ;

-- Índice para filtrar médicos validados/no validados en admin
CREATE INDEX IF NOT EXISTS idx_medicos_refeps_validado
  ON medicos (refeps_validado);

-- Comentarios para documentar
COMMENT ON COLUMN medicos.refeps_validado IS 'true si la matrícula fue verificada contra REFEPS (Bus de Interoperabilidad)';
COMMENT ON COLUMN medicos.refeps_data IS 'Respuesta FHIR Practitioner completa del REFEPS (identifiers, qualifications, etc.)';
COMMENT ON COLUMN medicos.refeps_validado_at IS 'Timestamp de la última validación REFEPS exitosa';
