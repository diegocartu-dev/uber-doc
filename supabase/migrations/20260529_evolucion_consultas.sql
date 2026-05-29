-- Migración: campo evolucion en consultas (F1 — Evolución obligatoria)
-- Columna ya existente en prod (aplicada desde PR #57 viejo).
-- Esta migración es idempotente — documenta el estado esperado.

ALTER TABLE consultas
ADD COLUMN IF NOT EXISTS evolucion TEXT;
