-- Fase 2 — Resolución de consultas por presencia (F2-1)
-- Aplicada en producción vía Supabase Management API el 2026-06-19.
-- Diseño: docs/diseno-resolucion-consultas.md §3.2 y §12 · DECISIONES_PRODUCTO_DOCTO.md §13.
--
-- Estados terminales nuevos + auditoría de la resolución automática + tracking
-- de ausencias del médico (sin penalización hoy, histórico para el futuro).
--
-- IMPORTANTE: el Bloque A (ADD VALUE al ENUM) se aplicó en una llamada aislada,
-- ANTES del Bloque B, porque un valor de ENUM recién agregado no puede usarse en
-- la misma transacción que lo crea.

-- ── Bloque A: estados terminales nuevos (ENUM estado_consulta) ──
ALTER TYPE estado_consulta ADD VALUE IF NOT EXISTS 'no_show_paciente';
ALTER TYPE estado_consulta ADD VALUE IF NOT EXISTS 'medico_ausente';
ALTER TYPE estado_consulta ADD VALUE IF NOT EXISTS 'interrumpida';
-- turnos.estado es TEXT (sin CHECK rígido): los valores nuevos no requieren DDL de tipo.

-- ── Bloque B: auditoría de resolución + tracking de ausencias ──
ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS resolucion_motivo TEXT,   -- 'no_show_paciente'|'medico_ausente'|'interrumpida'|'completada'
  ADD COLUMN IF NOT EXISTS resuelta_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resuelta_por TEXT;        -- 'cron_inicio'|'cron_rejoin'|'webhook'|'medico'
ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS resolucion_motivo TEXT,
  ADD COLUMN IF NOT EXISTS resuelta_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resuelta_por TEXT;

CREATE TABLE IF NOT EXISTS ausencias_medico (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id    UUID NOT NULL REFERENCES medicos(id),
  tipo         TEXT NOT NULL CHECK (tipo IN ('consulta','turno')),
  recurso_id   UUID NOT NULL,
  motivo       TEXT NOT NULL CHECK (motivo IN ('medico_ausente','interrumpida_sin_retomar')),
  detectado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ausencias_medico ON ausencias_medico (medico_id, detectado_at);
-- Solo service role (webhook + crons usan admin client); sin policies para authenticated.
ALTER TABLE ausencias_medico ENABLE ROW LEVEL SECURITY;
