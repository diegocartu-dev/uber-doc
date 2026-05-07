-- Migración: campo evolucion en consultas
-- Sprint: Historia Clínica + Nova Evolución

ALTER TABLE consultas
ADD COLUMN IF NOT EXISTS evolucion TEXT;
