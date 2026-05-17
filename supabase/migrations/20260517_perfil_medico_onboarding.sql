-- Sprint Perfil Médico — Onboarding progresivo
-- Columnas nuevas + función helper + trigger perfil_completo
-- Bio/presentación EXCLUIDA de este sprint
-- Autor: Marcos (Claude Code)
-- Fecha: 2026-05-17

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. COLUMNAS NUEVAS
-- ═══════════════════════════════════════════════════════════════════════

-- telefono profesional
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS telefono TEXT;

-- domicilio del consultorio (obligatorio ReNaPDiS Decreto 63/2024)
-- Nota: ya existe columna "domicilio" en la tabla. Usamos nueva columna
-- para distinguir domicilio personal de domicilio profesional.
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS domicilio_consultorio TEXT;
COMMENT ON COLUMN medicos.domicilio_consultorio IS
  'Domicilio donde se realiza el acto médico. Obligatorio por ReNaPDiS Decreto 63/2024.';

-- foto de perfil (distinta a foto_credencial_url que es la credencial escaneada)
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- perfil completo (calculado por trigger)
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS perfil_completo BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN medicos.perfil_completo IS
  'True cuando el médico completó todos los datos obligatorios. Solo cuando es true puede aparecer en el sistema.';

-- soft delete para baja
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS dado_de_baja BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS dado_de_baja_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. FUNCIÓN HELPER — verificar perfil completo
-- Bio excluida de este sprint por decisión de producto
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION medico_perfil_completo(medico_row medicos)
RETURNS boolean AS $$
BEGIN
  RETURN (
    medico_row.nombre_completo IS NOT NULL AND TRIM(medico_row.nombre_completo) != '' AND
    medico_row.especialidad IS NOT NULL AND TRIM(medico_row.especialidad) != '' AND
    medico_row.numero_matricula IS NOT NULL AND TRIM(medico_row.numero_matricula) != '' AND
    medico_row.tipo_matricula IS NOT NULL AND TRIM(medico_row.tipo_matricula) != '' AND
    medico_row.telefono IS NOT NULL AND TRIM(medico_row.telefono) != '' AND
    medico_row.foto_url IS NOT NULL AND TRIM(medico_row.foto_url) != '' AND
    medico_row.domicilio_consultorio IS NOT NULL AND TRIM(medico_row.domicilio_consultorio) != ''
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. TRIGGER — sync perfil_completo en INSERT/UPDATE
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_perfil_completo()
RETURNS TRIGGER AS $$
BEGIN
  NEW.perfil_completo := medico_perfil_completo(NEW);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_perfil_completo ON medicos;
CREATE TRIGGER trg_sync_perfil_completo
  BEFORE INSERT OR UPDATE ON medicos
  FOR EACH ROW EXECUTE FUNCTION sync_perfil_completo();

-- ═══════════════════════════════════════════════════════════════════════
-- 4. BACKFILL — recalcular perfil_completo para médicos existentes
-- ═══════════════════════════════════════════════════════════════════════

UPDATE medicos SET perfil_completo = medico_perfil_completo(medicos.*);

COMMIT;
