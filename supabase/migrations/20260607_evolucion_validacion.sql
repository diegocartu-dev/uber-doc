-- ============================================================================
-- Evoluciones / Mis pacientes — validación humana de la evolución pre-armada
-- Fecha: 2026-06-07
-- Sprint: Evoluciones (Etapa 1 — motor de composición + migración)
-- ============================================================================
-- CONTEXTO: la función "Evoluciones" pre-arma el campo evolución re-ordenando
-- datos que YA cargó un humano (triage del paciente, diagnóstico/indicaciones/
-- receta del médico, demográficos). Es una plantilla determinística, NO un LLM.
-- Principio innegociable: cada palabra de la evolución tiene un autor humano.
--
-- Por eso necesitamos registrar el acto humano de validación: el médico SIEMPRE
-- tiene que tocar "Revisé y confirmo" antes de cerrar. Estas dos columnas dejan
-- traza de esa validación, tanto para Consulta Inmediata (`consultas`) como para
-- turnos programados (`turnos`) — ambas tablas alimentan el mismo workspace.
--
--   evolucion_validada_at  — instante en que el médico confirmó la evolución.
--                            NULL = todavía no validó (no debería cerrarse así).
--   evolucion_editada      — true si el médico modificó/agregó algo al texto
--                            pre-armado; false si lo confirmó tal cual salió de
--                            la plantilla. Sirve para métricas de calidad de la
--                            plantilla (cuánto reescriben los médicos) y auditoría.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS en ambas tablas.
--
-- NO APLICADA TODAVÍA. La aplica Diego manualmente (regla CLAUDE.md: las
-- migraciones requieren OK explícito antes de ejecutar el DDL).
-- ============================================================================

BEGIN;

ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS evolucion_validada_at timestamptz,
  ADD COLUMN IF NOT EXISTS evolucion_editada boolean NOT NULL DEFAULT false;

ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS evolucion_validada_at timestamptz,
  ADD COLUMN IF NOT EXISTS evolucion_editada boolean NOT NULL DEFAULT false;

COMMIT;

-- Rollback:
--   ALTER TABLE public.consultas
--     DROP COLUMN IF EXISTS evolucion_validada_at,
--     DROP COLUMN IF EXISTS evolucion_editada;
--   ALTER TABLE public.turnos
--     DROP COLUMN IF EXISTS evolucion_validada_at,
--     DROP COLUMN IF EXISTS evolucion_editada;
