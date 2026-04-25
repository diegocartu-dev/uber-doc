-- Quality Gate: flag para excluir cuentas de prueba de métricas
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS es_cuenta_test BOOLEAN DEFAULT false;
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS es_cuenta_test BOOLEAN DEFAULT false;
