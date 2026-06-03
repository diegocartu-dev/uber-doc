-- ============================================================================
-- HOTFIX: GRANT de columnas Didit/identidad en public.medicos
-- Fecha: 2026-06-03
-- Incidente: docs/security/2026-06-03-incidente-grant-medicos-didit.md
-- ============================================================================
-- CAUSA RAÍZ
-- La tabla `medicos` usa grants SELECT columna-por-columna (no a nivel tabla),
-- por el control de seguridad de `20260527_contacto_privado_medico.sql`
-- (REVOKE table-level + re-GRANT solo de columnas públicas, dejando
-- celular_personal/email_personal accesibles únicamente por service_role).
--
-- La migración `20260602_didit_identidad_medico.sql` agregó columnas nuevas
-- (identidad_validada, didit_status, ...) pero NO las sumó a ese GRANT.
-- Consecuencia: cualquier query de cliente (anon/authenticated) que las pida
-- explota con `permission denied for table medicos` (SQLSTATE 42501), devuelve
-- null, y rompe en cascada:
--   - /dashboard → médicos caían a modo paciente (síntoma reportado)
--   - /clinica/[medicoId]/turnos → ver turnos / reservar caído
--   - /api/medico/perfil → médico no podía editar matrícula (500)
--   - /clinica (con flag identidad_gate_activa ON) → grilla vacía
--
-- FIX (aprobado en revisión de seguridad por Roberto, 2026-06-03)
-- Sumar SOLO las columnas públicas nuevas al GRANT, replicando la convención
-- del 27-may. didit_status NO va a anon (ningún path público lo usa; mínimo
-- privilegio). identidad_validada_at y didit_session_id quedan SIN grant
-- (solo los lee service_role vía admin client) — son audit/internos.
--
-- NOTA: este GRANT ya fue aplicado a producción el 2026-06-03 vía Supabase
-- Management API para restaurar el servicio. Esta migración lo deja registrado
-- y reproducible (es idempotente: re-aplicar es no-op).
-- ============================================================================

GRANT SELECT (identidad_validada, didit_status) ON public.medicos TO authenticated;
GRANT SELECT (identidad_validada)               ON public.medicos TO anon;

-- celular_personal, email_personal, identidad_validada_at, didit_session_id
-- siguen SIN grant a propósito (solo service_role). No agregar acá.

-- Rollback:
--   REVOKE SELECT (identidad_validada, didit_status) ON public.medicos FROM authenticated;
--   REVOKE SELECT (identidad_validada)               ON public.medicos FROM anon;
