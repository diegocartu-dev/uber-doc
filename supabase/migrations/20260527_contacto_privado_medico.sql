-- ============================================================================
-- Migracion: Campos de contacto privado del medico
-- Sprint: Post-QA E2E 27/05
-- Fecha: 2026-05-27
-- ============================================================================
-- Campos internos de Docto para contactar al medico. NUNCA visibles al
-- paciente. Solo admin y CRM interno.
--
-- Decision de producto (Diego, 27/05): estos son DATOS ACCESORIOS bajo la
-- inscripcion AAIP vigente (RL-2026-41929595). No requiere consulta legal
-- adicional ni consentimiento separado. El TyC vigente los cubre.
-- ============================================================================

-- Campos de contacto privado
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS celular_personal TEXT;
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS email_personal TEXT;

COMMENT ON COLUMN medicos.celular_personal IS
  'Celular personal del medico. Uso interno Docto (soporte, onboarding). NUNCA visible al paciente.';
COMMENT ON COLUMN medicos.email_personal IS
  'Email personal del medico (puede diferir del email de registro). Uso interno Docto. NUNCA visible al paciente.';

-- ============================================================================
-- SEGURIDAD: Revocar SELECT en columnas privadas para roles no-admin.
-- Esto previene que PostgREST exponga estos campos a cualquier usuario
-- autenticado que haga SELECT * o incluya estas columnas explicitamente.
-- Solo service_role (adminClient) puede leer estos campos.
--
-- Hallazgo critico de Roberto (auditoría 27/05): la RLS existente de la
-- tabla medicos permite SELECT a cualquier authenticated. Sin REVOKE,
-- cualquier paciente podria leer celular_personal/email_personal via
-- PostgREST directamente.
-- ============================================================================

REVOKE SELECT (celular_personal, email_personal) ON medicos FROM authenticated;
REVOKE SELECT (celular_personal, email_personal) ON medicos FROM anon;
