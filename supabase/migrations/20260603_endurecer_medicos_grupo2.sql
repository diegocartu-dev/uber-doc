-- ============================================================================
-- Endurecimiento de privacidad de `medicos` — Grupo 2 (cierre inmediato)
-- Fecha: 2026-06-03
-- Auditoría: @roberto (empírica, contra producción) — APROBADO
-- Doc: docs/security/2026-06-03-incidente-grant-medicos-didit.md
-- ============================================================================
-- DECISIÓN DE PRODUCTO (Diego): el paciente solo debe ver del médico lo mínimo
-- (nombre, especialidad, valor, duración) + lo funcional no-sensible (foto,
-- disponibilidad, slug). El resto se cierra.
--
-- Esta migración cierra el "Grupo 2": 18 columnas internas/sensibles que hoy
-- cualquier usuario logueado (y anon) podía leer vía PostgREST, y que SOLO usa
-- el panel admin (createAdminClient / service_role, que NO se ve afectado por
-- este REVOKE). Verificado empíricamente: ninguna query de cliente (paciente ni
-- médico) selecciona ni filtra estas columnas, así que el cierre no rompe nada.
--
-- Incluye DNI/CUIT: aunque el doc del 27-may los consideraba "públicos" (van en
-- la receta), la receta se genera del lado servidor (admin); ninguna pantalla de
-- cliente los lee. Cerrarlos es seguro y más prolijo.
--
-- NOTA: ya aplicado a producción el 2026-06-03 vía Management API. Esta migración
-- lo deja registrado y reproducible.
--
-- El cierre TOTAL (que el paciente lea solo de una vista pública mínima) es el
-- "Entregable 2" de la auditoría: vista `medicos_publico` + RLS endurecida. Eso
-- va como sprint aparte con orden estricto (NO en esta migración).
-- ============================================================================

REVOKE SELECT (
  categoria, created_at, cuit, dado_de_baja, dado_de_baja_at,
  declaracion_matricula_at, dni, matricula_provincial, mp_conectado,
  notas_admin, pacientes_en_espera, provincia_matricula,
  refeps_data, refeps_validado, refeps_validado_at,
  terminos_aceptados_at, verificado_at, verificado_por
) ON public.medicos FROM authenticated, anon;

-- Verificación post-deploy:
--   npx tsx scripts/verify-grants-medicos.ts

-- Rollback:
--   GRANT SELECT (
--     categoria, created_at, cuit, dado_de_baja, dado_de_baja_at,
--     declaracion_matricula_at, dni, matricula_provincial, mp_conectado,
--     notas_admin, pacientes_en_espera, provincia_matricula,
--     refeps_data, refeps_validado, refeps_validado_at,
--     terminos_aceptados_at, verificado_at, verificado_por
--   ) ON public.medicos TO authenticated, anon;
