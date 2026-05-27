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
-- SEGURIDAD: Restringir SELECT en columnas privadas para roles no-admin.
--
-- PostgreSQL: column-level REVOKE no funciona si hay un GRANT a nivel de
-- tabla (el table-level grant sigue cubriendo todas las columnas). Por eso:
-- 1. REVOKE SELECT a nivel de tabla (elimina acceso global)
-- 2. Re-GRANT SELECT en cada columna publica individualmente
-- 3. celular_personal y email_personal quedan SIN grant → inaccesibles
--
-- Solo service_role (adminClient) conserva acceso a todas las columnas.
--
-- Hallazgo critico de Roberto (auditoria 27/05): la RLS existente de la
-- tabla medicos permite SELECT a cualquier authenticated. Sin esta
-- restriccion, cualquier paciente podria leer celular_personal/email_personal
-- via PostgREST directamente.
-- ============================================================================

-- Step 1: Revocar SELECT a nivel de tabla
REVOKE SELECT ON medicos FROM authenticated;
REVOKE SELECT ON medicos FROM anon;

-- Step 2: Re-grant SELECT en todas las columnas PUBLICAS
GRANT SELECT (
  id, user_id, nombre_completo, email, especialidad, tipo_matricula,
  numero_matricula, provincia, precio_consulta, duracion_consulta,
  modalidad_atencion, created_at, disponible, disponible_desde,
  disponible_hasta, pacientes_en_espera, terminos_aceptados_at,
  declaracion_matricula_at, cuit, matricula_provincial, provincia_matricula,
  domicilio, slug, titulo, oculto_clinica, verificado, verificado_at,
  verificado_por, dni, foto_credencial_url, estado_registro, notas_admin,
  es_cuenta_test, nova_evolucion_activa, categoria, mp_conectado,
  visible_consultorio_particular, telefono, domicilio_consultorio, foto_url,
  perfil_completo, dado_de_baja, dado_de_baja_at, refeps_validado,
  refeps_data, refeps_validado_at, firma_manuscrita_url
) ON medicos TO authenticated;

GRANT SELECT (
  id, user_id, nombre_completo, email, especialidad, tipo_matricula,
  numero_matricula, provincia, precio_consulta, duracion_consulta,
  modalidad_atencion, created_at, disponible, disponible_desde,
  disponible_hasta, pacientes_en_espera, terminos_aceptados_at,
  declaracion_matricula_at, cuit, matricula_provincial, provincia_matricula,
  domicilio, slug, titulo, oculto_clinica, verificado, verificado_at,
  verificado_por, dni, foto_credencial_url, estado_registro, notas_admin,
  es_cuenta_test, nova_evolucion_activa, categoria, mp_conectado,
  visible_consultorio_particular, telefono, domicilio_consultorio, foto_url,
  perfil_completo, dado_de_baja, dado_de_baja_at, refeps_validado,
  refeps_data, refeps_validado_at, firma_manuscrita_url
) ON medicos TO anon;

-- NOTA: celular_personal y email_personal NO estan en los GRANTs anteriores.
-- Solo service_role puede leerlos (via createAdminClient en page.tsx).
