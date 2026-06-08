-- ============================================================================
-- Registro de la columna base de evolución en turnos: turnos.evolucion (TEXT)
-- Fecha: 2026-06-07
-- Sprint: Evoluciones (Etapa 1 — motor de composición + migración)
-- ============================================================================
-- CONTEXTO: el campo `evolucion` es el texto clínico que el médico valida y
-- guarda al cerrar la atención. En `consultas` la columna ya existía; en
-- `turnos` se agregó directamente sobre producción durante el sprint y nunca
-- quedó el archivo de migración en el repo. Esto sólo registra ese DDL para
-- mantener el historial reproducible.
--
-- YA APLICADA EN PRODUCCIÓN. Este archivo es únicamente registro histórico:
-- no hay que volver a ejecutarlo. Es idempotente (ADD COLUMN IF NOT EXISTS),
-- así que correrlo de nuevo no rompe nada.
-- ============================================================================

ALTER TABLE public.turnos ADD COLUMN IF NOT EXISTS evolucion TEXT;

-- Rollback:
--   ALTER TABLE public.turnos DROP COLUMN IF EXISTS evolucion;
