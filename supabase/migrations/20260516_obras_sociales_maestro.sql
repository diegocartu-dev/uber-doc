-- Sprint PR 2 Receta — Arquitectura definitiva de Obras Sociales
-- Tablas maestras + seed 15 OOSS + planes + backfill pacientes
-- Autor: Marcos (Claude Code)
-- Fecha: 2026-05-16

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. TABLA MAESTRA: obras_sociales
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS obras_sociales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('prepaga', 'obra_social', 'mixta')),
  activo BOOLEAN NOT NULL DEFAULT true,
  orden_visualizacion INT NOT NULL DEFAULT 99,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE obras_sociales IS 'Tabla maestra de obras sociales y prepagas argentinas';

-- RLS: lectura pública (dropdown), escritura solo admin
ALTER TABLE obras_sociales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obras_sociales_lectura_publica" ON obras_sociales
  FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. TABLA MAESTRA: obras_sociales_planes
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS obras_sociales_planes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_social_id UUID NOT NULL REFERENCES obras_sociales(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden_visualizacion INT NOT NULL DEFAULT 99,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(obra_social_id, nombre)
);

COMMENT ON TABLE obras_sociales_planes IS 'Planes por obra social (solo para OOSS que tienen planes)';

-- RLS: lectura pública (dropdown), escritura solo admin
ALTER TABLE obras_sociales_planes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obras_sociales_planes_lectura_publica" ON obras_sociales_planes
  FOR SELECT USING (true);

-- Índice para dropdown de planes por OOSS
CREATE INDEX IF NOT EXISTS idx_planes_obra_social ON obras_sociales_planes(obra_social_id) WHERE activo = true;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. MODIFICAR PACIENTES — agregar FK + campos nuevos
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS obra_social_id UUID REFERENCES obras_sociales(id),
  ADD COLUMN IF NOT EXISTS obra_social_otra TEXT,
  ADD COLUMN IF NOT EXISTS cobertura_validada_en TIMESTAMPTZ;

COMMENT ON COLUMN pacientes.obra_social_id IS 'FK a obras_sociales — NULL si eligió "Otra" o "Particular"';
COMMENT ON COLUMN pacientes.obra_social_otra IS 'Nombre libre si eligió "Otra" OOSS no listada';
COMMENT ON COLUMN pacientes.cobertura_validada_en IS 'Última vez que el paciente confirmó sus datos de cobertura pre-consulta';
COMMENT ON COLUMN pacientes.obra_social IS 'DEPRECATED — texto libre de PR1, mantener 1 mes como fallback';

-- ═══════════════════════════════════════════════════════════════════════
-- 4. SEED — 15 Obras Sociales aprobadas por Diego
-- ═══════════════════════════════════════════════════════════════════════

-- Prepagas con planes
INSERT INTO obras_sociales (nombre, tipo, orden_visualizacion) VALUES
  ('OSDE', 'prepaga', 1),
  ('Swiss Medical', 'prepaga', 2),
  ('Galeno', 'prepaga', 3),
  ('Medifé', 'prepaga', 4),
  ('Omint', 'prepaga', 5),
  ('Accord Salud', 'prepaga', 6),
  ('Sancor Salud', 'prepaga', 7),
  ('Avalian', 'prepaga', 8)
ON CONFLICT (nombre) DO NOTHING;

-- Obras sociales sin planes
INSERT INTO obras_sociales (nombre, tipo, orden_visualizacion) VALUES
  ('IOMA', 'obra_social', 9),
  ('PAMI', 'obra_social', 10),
  ('OSPE', 'obra_social', 11),
  ('OSDEPYM', 'obra_social', 12),
  ('OSECAC', 'obra_social', 13),
  ('OSPRERA', 'obra_social', 14),
  ('Construir Salud', 'obra_social', 15)
ON CONFLICT (nombre) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. SEED — Planes por OOSS (solo prepagas que tienen planes)
-- ═══════════════════════════════════════════════════════════════════════

-- OSDE
INSERT INTO obras_sociales_planes (obra_social_id, nombre, orden_visualizacion)
SELECT os.id, plan.nombre, plan.ord
FROM obras_sociales os,
  (VALUES ('210', 1), ('310', 2), ('410', 3), ('450', 4), ('510', 5)) AS plan(nombre, ord)
WHERE os.nombre = 'OSDE'
ON CONFLICT (obra_social_id, nombre) DO NOTHING;

-- Swiss Medical
INSERT INTO obras_sociales_planes (obra_social_id, nombre, orden_visualizacion)
SELECT os.id, plan.nombre, plan.ord
FROM obras_sociales os,
  (VALUES ('SMG 20', 1), ('SMG 30', 2), ('SMG 40', 3), ('SMG 50', 4), ('SMG 60', 5)) AS plan(nombre, ord)
WHERE os.nombre = 'Swiss Medical'
ON CONFLICT (obra_social_id, nombre) DO NOTHING;

-- Galeno
INSERT INTO obras_sociales_planes (obra_social_id, nombre, orden_visualizacion)
SELECT os.id, plan.nombre, plan.ord
FROM obras_sociales os,
  (VALUES ('Azul', 1), ('Plata', 2), ('Oro', 3), ('Platino', 4)) AS plan(nombre, ord)
WHERE os.nombre = 'Galeno'
ON CONFLICT (obra_social_id, nombre) DO NOTHING;

-- Medifé
INSERT INTO obras_sociales_planes (obra_social_id, nombre, orden_visualizacion)
SELECT os.id, plan.nombre, plan.ord
FROM obras_sociales os,
  (VALUES ('Noble', 1), ('Bronce', 2), ('Plata', 3), ('Oro', 4), ('Platinum', 5)) AS plan(nombre, ord)
WHERE os.nombre = 'Medifé'
ON CONFLICT (obra_social_id, nombre) DO NOTHING;

-- Omint
INSERT INTO obras_sociales_planes (obra_social_id, nombre, orden_visualizacion)
SELECT os.id, plan.nombre, plan.ord
FROM obras_sociales os,
  (VALUES ('Classic', 1), ('Global', 2), ('Premium', 3)) AS plan(nombre, ord)
WHERE os.nombre = 'Omint'
ON CONFLICT (obra_social_id, nombre) DO NOTHING;

-- Accord Salud
INSERT INTO obras_sociales_planes (obra_social_id, nombre, orden_visualizacion)
SELECT os.id, plan.nombre, plan.ord
FROM obras_sociales os,
  (VALUES ('1000', 1), ('2000', 2), ('3000', 3), ('4000', 4), ('5000', 5)) AS plan(nombre, ord)
WHERE os.nombre = 'Accord Salud'
ON CONFLICT (obra_social_id, nombre) DO NOTHING;

-- Sancor Salud
INSERT INTO obras_sociales_planes (obra_social_id, nombre, orden_visualizacion)
SELECT os.id, plan.nombre, plan.ord
FROM obras_sociales os,
  (VALUES ('1000', 1), ('2000', 2), ('3000', 3), ('4000', 4), ('5000', 5)) AS plan(nombre, ord)
WHERE os.nombre = 'Sancor Salud'
ON CONFLICT (obra_social_id, nombre) DO NOTHING;

-- Avalian
INSERT INTO obras_sociales_planes (obra_social_id, nombre, orden_visualizacion)
SELECT os.id, plan.nombre, plan.ord
FROM obras_sociales os,
  (VALUES ('A1', 1), ('A2', 2), ('A3', 3), ('A4', 4), ('A5', 5)) AS plan(nombre, ord)
WHERE os.nombre = 'Avalian'
ON CONFLICT (obra_social_id, nombre) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. BACKFILL — Migrar pacientes existentes de texto libre a FK
-- ═══════════════════════════════════════════════════════════════════════

-- 6a. Pacientes que matchean con OOSS de la tabla maestra → obra_social_id
UPDATE pacientes p
SET obra_social_id = os.id
FROM obras_sociales os
WHERE p.obra_social IS NOT NULL
  AND TRIM(p.obra_social) != ''
  AND p.obra_social_id IS NULL
  AND LOWER(TRIM(p.obra_social)) = LOWER(os.nombre);

-- 6b. Pacientes que NO matchean → obra_social_otra
UPDATE pacientes
SET obra_social_otra = TRIM(obra_social)
WHERE obra_social IS NOT NULL
  AND TRIM(obra_social) != ''
  AND obra_social_id IS NULL
  AND obra_social_otra IS NULL;

COMMIT;
