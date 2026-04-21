-- Migration 046: Registro seguro de médicos
-- Agrega verificación obligatoria, DNI, estado de registro, foto credencial
-- y UNIQUE compuesto en matrícula para prevenir suplantación de identidad.

-- 1. Columnas de verificación y seguridad
ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS verificado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verificado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verificado_por TEXT,
  ADD COLUMN IF NOT EXISTS dni TEXT,
  ADD COLUMN IF NOT EXISTS foto_credencial_url TEXT,
  ADD COLUMN IF NOT EXISTS estado_registro TEXT
    DEFAULT 'pendiente_revision'
    CHECK (estado_registro IN ('pendiente_revision', 'aprobado', 'rechazado', 'suspendido'));

-- 2. UNIQUE compuesto en matrícula (tipo + número + provincia)
-- Permite MN-12345 y MP-12345-Buenos Aires como registros distintos
DROP INDEX IF EXISTS idx_medicos_matricula_unique;
CREATE UNIQUE INDEX idx_medicos_matricula_unique
  ON public.medicos (tipo_matricula, numero_matricula, COALESCE(provincia_matricula, ''));

-- 3. Limpiar médicos fantasma creados por trigger 017
-- (matrícula vacía y precio 0 = creados automáticamente, nunca completaron registro)
DELETE FROM public.medicos
  WHERE (numero_matricula IS NULL OR numero_matricula = '')
    AND precio_consulta = 0;

-- 4. Marcar médicos existentes (pre-migración) como aprobados
-- para no romper el flujo actual de médicos ya activos
UPDATE public.medicos
  SET verificado = true,
      estado_registro = 'aprobado',
      verificado_at = now(),
      verificado_por = 'migracion_046_retroactivo'
  WHERE numero_matricula IS NOT NULL
    AND numero_matricula != ''
    AND precio_consulta > 0;

-- 5. Storage bucket para fotos de credencial de matrícula
INSERT INTO storage.buckets (id, name, public)
  VALUES ('credenciales-medicos', 'credenciales-medicos', false)
  ON CONFLICT (id) DO NOTHING;

-- Policy: médicos pueden subir su propia credencial
CREATE POLICY "Médicos suben su credencial"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'credenciales-medicos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: médicos pueden ver su propia credencial
CREATE POLICY "Médicos ven su credencial"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'credenciales-medicos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: service_role puede ver todas las credenciales (para panel admin)
CREATE POLICY "Admin ve todas las credenciales"
  ON storage.objects FOR SELECT TO service_role
  USING (bucket_id = 'credenciales-medicos');
