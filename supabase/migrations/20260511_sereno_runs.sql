-- Tabla para almacenar resultados de corridas de Sereno (Quality Gate)
CREATE TABLE IF NOT EXISTS sereno_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL,
  passed INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('ok', 'fail')),
  details JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sereno_runs_fecha ON sereno_runs(fecha DESC);

ALTER TABLE sereno_runs ENABLE ROW LEVEL SECURITY;

-- Backfill es_cuenta_test NULLs y setear default
UPDATE medicos SET es_cuenta_test = false WHERE es_cuenta_test IS NULL;
UPDATE pacientes SET es_cuenta_test = false WHERE es_cuenta_test IS NULL;
ALTER TABLE medicos ALTER COLUMN es_cuenta_test SET DEFAULT false;
ALTER TABLE pacientes ALTER COLUMN es_cuenta_test SET DEFAULT false;
