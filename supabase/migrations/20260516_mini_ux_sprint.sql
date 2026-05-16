-- Sprint Mini UX — Migraciones
-- 1. Nueva columna visible_consultorio_particular en medicos
-- 2. Verificar/agregar estado 'rechazada' en consultas
-- Autor: Marcos (Claude Code)
-- Fecha: 2026-05-16

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. COLUMNA: visible_consultorio_particular
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE medicos
  ADD COLUMN IF NOT EXISTS visible_consultorio_particular BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN medicos.visible_consultorio_particular IS
  'Médico acepta pacientes via su link de Consultorio Particular cuando está disponible.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. ESTADO 'rechazada' EN CONSULTAS
-- Si hay un CHECK constraint en consultas.estado, actualizarlo.
-- Si no hay CHECK (usa texto libre), no hace falta nada.
-- ═══════════════════════════════════════════════════════════════════════

-- Intentar dropear y recrear el constraint si existe
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'consultas'::regclass
    AND conname LIKE '%estado%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE consultas DROP CONSTRAINT %I', constraint_name);
    ALTER TABLE consultas ADD CONSTRAINT consultas_estado_check CHECK (
      estado IN ('esperando', 'aceptada', 'pagada', 'en_curso', 'completada', 'cancelada', 'rechazada')
    );
  END IF;
END $$;

COMMIT;
