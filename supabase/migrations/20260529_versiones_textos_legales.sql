-- Migración: tabla de versionado de textos legales + registro de aceptación
-- Permite vincular cada aceptación (CI, T&C, privacidad, datos sensibles)
-- con el texto exacto que el usuario aceptó (hash + referencia).

-- 1. Tabla de versiones de textos legales
CREATE TABLE IF NOT EXISTS versiones_textos_legales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('ci', 'tyc_paciente', 'tyc_medico', 'privacidad', 'datos_sensibles')),
  version TEXT NOT NULL,
  texto_completo TEXT NOT NULL,
  hash_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo, version)
);

-- 2. Tabla de aceptaciones (registro probatorio)
CREATE TABLE IF NOT EXISTS aceptaciones_legales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  version_id UUID NOT NULL REFERENCES versiones_textos_legales(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('ci', 'tyc_paciente', 'tyc_medico', 'privacidad', 'datos_sensibles')),
  consulta_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_aceptaciones_user_tipo ON aceptaciones_legales(user_id, tipo);
CREATE INDEX IF NOT EXISTS idx_aceptaciones_consulta ON aceptaciones_legales(consulta_id) WHERE consulta_id IS NOT NULL;

-- 3. RLS: cada usuario ve solo sus propias aceptaciones
ALTER TABLE aceptaciones_legales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_select_own_aceptaciones"
  ON aceptaciones_legales FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_insert_own_aceptaciones"
  ON aceptaciones_legales FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- versiones_textos_legales: lectura pública (los textos son públicos), escritura solo admin
ALTER TABLE versiones_textos_legales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_versiones"
  ON versiones_textos_legales FOR SELECT TO authenticated
  USING (true);

-- 4. Seed: versiones iniciales de textos existentes
-- (texto_completo se carga vía API admin, aquí van los registros base)
INSERT INTO versiones_textos_legales (tipo, version, texto_completo, hash_sha256)
VALUES
  ('ci', 'v1', 'Consentimiento Informado para Teleconsulta - versión vigente mayo 2026', 'pending_hash'),
  ('tyc_paciente', 'v1', 'Términos y Condiciones para Pacientes - versión vigente mayo 2026', 'pending_hash'),
  ('privacidad', 'v1', 'Política de Privacidad - versión vigente mayo 2026', 'pending_hash'),
  ('datos_sensibles', 'v1', 'Consentimiento para tratamiento de datos de salud - versión vigente mayo 2026', 'pending_hash')
ON CONFLICT (tipo, version) DO NOTHING;
