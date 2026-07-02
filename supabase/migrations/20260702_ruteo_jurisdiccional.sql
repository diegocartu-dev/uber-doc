-- Ruteo por jurisdicción (Clínica Virtual) — ver docs/sprints/2026-07-02-plan-ruteo-jurisdiccional.md
-- Aplicada en prod via Management API el 2026-07-02.

-- Provincia declarada por el paciente (para rutear a médicos habilitados en su jurisdicción).
-- NULL = aún no la declaró.
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS provincia TEXT;

-- Alcance del médico: provincias de sus matrículas HABILITADAS según REFEPS (Regla A).
-- Se deriva de refeps_data.matriculas al validar (ver src/lib/jurisdicciones.ts) y por backfill.
-- Vacío '{}' = "sin resolver": el fail-safe lo MUESTRA y lo marca, nunca lo esconde por vacío.
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS jurisdicciones TEXT[] DEFAULT '{}';
