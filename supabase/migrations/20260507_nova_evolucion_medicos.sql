-- Migración: toggle Nova Evolución en medicos
-- Sprint: Historia Clínica + Nova Evolución

ALTER TABLE medicos
ADD COLUMN IF NOT EXISTS nova_evolucion_activa BOOLEAN DEFAULT false;
