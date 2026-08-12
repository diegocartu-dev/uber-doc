-- 008_padron.sql — Deltas de `pacientes` para el alta provisionada (spec §5.1).
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
--
-- El padrón institucional se PROVISIONA (panel, import CSV, API): no hay
-- auto-registro. Los requisitos mínimos del alta (propuesta vigente del guion,
-- pendiente #10 de la spec) son: DNI, nombre, fecha de nacimiento, sexo DNI,
-- localidad y celular (mail opcional como fallback). `pacientes` clonada del
-- B2C ya tiene todo menos `localidad` y el rastro de auditoría de la provisión.

ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS localidad text,
  -- Auditoría de la provisión (spec §5.1 paso 5): quién/cómo dio el alta.
  -- `provisionado_detalle` lleva el contexto (operador_id si vino de la
  -- pantalla, admin user_id si vino del import, nombre del archivo, etc.).
  ADD COLUMN IF NOT EXISTS provisionado_via text
    CHECK (provisionado_via IN ('panel','csv','api')),
  ADD COLUMN IF NOT EXISTS provisionado_detalle jsonb,
  ADD COLUMN IF NOT EXISTS provisionado_at timestamptz;

-- Búsqueda del otorgador (spec §4.3: GET /api/otorgador/padron?q=, prefijo por
-- DNI o apellido desde 3 chars). text_pattern_ops habilita el índice para
-- LIKE 'q%' con el collation por defecto. El padrón provincial puede ser
-- grande: sin índice la búsqueda del call center escanearía la tabla entera.
CREATE INDEX IF NOT EXISTS idx_pacientes_dni_prefijo
  ON pacientes (dni text_pattern_ops)
  WHERE dni IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pacientes_nombre_lower
  ON pacientes (lower(nombre_completo) text_pattern_ops)
  WHERE nombre_completo IS NOT NULL;
