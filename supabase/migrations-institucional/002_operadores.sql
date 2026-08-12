-- 002_operadores.sql — Operadores de la institución (humanos e IA) + API keys.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
--
-- El operador es la identidad de la API de asignación: la pantalla del
-- otorgador (humano con sesión Supabase + fila acá), un agente IA vía API key
-- (hash en operador_api_keys, header Authorization: Bearer) — mismos
-- endpoints, misma auditoría, misma priorización.

CREATE TABLE operadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),          -- NULL para tipo 'ia'
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'humano' CHECK (tipo IN ('humano','ia')),
  nivel text NOT NULL CHECK (nivel IN ('otorgador','admin_institucion')),
  activo boolean NOT NULL DEFAULT true
);

-- Resolución de rol (extensión de src/lib/auth/rol.ts, Etapa 1): lookup por
-- user_id con service role.
CREATE INDEX idx_operadores_user_id ON operadores (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE operador_api_keys (                   -- operadores tipo 'ia' y sucesores
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operador_id uuid NOT NULL REFERENCES operadores(id),
  key_hash text NOT NULL,                          -- hash de la key; la key pelada NUNCA se guarda
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_operador_api_keys_operador ON operador_api_keys (operador_id);

-- RLS activo SIN policies (patrón video_presencia): solo service role.
-- La vía de asignación corre entera con service role; los guards son de
-- aplicación + auditoría en `asignaciones`.
ALTER TABLE operadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE operador_api_keys ENABLE ROW LEVEL SECURITY;

-- Cinturón además del RLS para los hashes de keys: sin GRANT a los roles de
-- PostgREST (misma disciplina de grants del B2C).
REVOKE ALL ON operador_api_keys FROM anon, authenticated;
