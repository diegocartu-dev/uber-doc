-- ============================================================================
-- Clínica Virtual — `disponible_desde_at` para desempate FIFO de la grilla
-- Fecha: 2026-06-03
-- Doc: DECISIONES_PRODUCTO §11.2 (orden de médicos en el modal) y §11.4 (desempate)
-- Auditoría: @roberto — APROBADO
-- ============================================================================
-- DECISIÓN DE PRODUCTO (§11.2/§11.4): en Consulta Inmediata, los médicos del modal
-- se ordenan por menor cantidad en sala de espera (asc) y, ante empate, por orden
-- FIFO de disponibilidad: el médico que se habilitó ANTES va primero. Hasta ahora
-- el desempate caía a `id` (estable pero arbitrario) porque `created_at` fue revocado
-- al client en 20260603_endurecer_medicos_grupo2.sql y no había un timestamp legible.
--
-- `disponible_desde_at` registra el instante en que el médico pasó disponible
-- false→true (lo setea la action del toggle en src/app/dashboard/actions.ts; se pone
-- a NULL cuando se apaga). Tiene GRANT propio para el client del paciente/anon, así
-- que NO reabre `created_at` ni ninguna otra columna sensible.
--
-- NOTA: ya aplicada a producción el 2026-06-03 vía Supabase Management API y validada
-- por @roberto. Esta migración la deja registrada y reproducible.
--
-- CONDICIÓN DE ROBERTO: el GRANT va en la MISMA transacción que el ADD COLUMN, para no
-- repetir el incidente del grant faltante (docs/security/2026-06-03-incidente-grant-medicos-didit.md).
-- ============================================================================

BEGIN;

ALTER TABLE public.medicos ADD COLUMN IF NOT EXISTS disponible_desde_at timestamptz;

GRANT SELECT (disponible_desde_at) ON public.medicos TO authenticated, anon;

-- Backfill: a los médicos hoy disponibles les damos un timestamp de partida
-- (created_at como aproximación de "desde cuándo está habilitado"; now() si faltara).
UPDATE public.medicos
  SET disponible_desde_at = COALESCE(disponible_desde_at, created_at, now())
  WHERE disponible = true;

COMMIT;

-- Rollback:
--   REVOKE SELECT (disponible_desde_at) ON public.medicos FROM authenticated, anon;
--   ALTER TABLE public.medicos DROP COLUMN IF EXISTS disponible_desde_at;
