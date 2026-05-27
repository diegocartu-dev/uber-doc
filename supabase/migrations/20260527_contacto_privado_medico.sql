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
-- RLS: Verificar que las policies existentes de la tabla medicos NO expongan
-- estos campos a pacientes. Las policies de SELECT para pacientes deben
-- listar columnas explicitamente o estar filtradas.
--
-- NOTA: Supabase PostgREST permite SELECT * por defecto si la policy USING
-- da acceso. Para restringir columnas a pacientes, se debe usar una VIEW
-- o un endpoint API que filtre los campos. La RLS de tabla no puede
-- restringir columnas individuales — solo filas.
--
-- MITIGACION: Los endpoints API que sirven datos de medicos a pacientes
-- (listado, perfil publico, cards de consulta) NUNCA incluyen estos campos
-- en sus SELECTs. Solo el endpoint /api/admin/* incluye todos los campos.
-- ============================================================================
