-- ============================================================================
-- Migración: Firma manuscrita del médico
-- Sprint: Firma manuscrita en PDF de receta
-- Fecha: 2026-05-23
-- ============================================================================
-- Agrega columna para almacenar la URL de la firma manuscrita del médico.
-- La imagen se almacena en bucket privado 'firmas-medicos' de Supabase Storage.
-- NO se incluye en el trigger de perfil_completo (es opcional).
-- ============================================================================

ALTER TABLE medicos
  ADD COLUMN IF NOT EXISTS firma_manuscrita_url TEXT;

COMMENT ON COLUMN medicos.firma_manuscrita_url
  IS 'Path en Supabase Storage (bucket privado firmas-medicos) de la imagen de firma manuscrita del médico';

-- Crear bucket privado para firmas manuscritas
INSERT INTO storage.buckets (id, name, public)
VALUES ('firmas-medicos', 'firmas-medicos', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: solo el médico owner puede subir/actualizar/borrar su firma
CREATE POLICY "Medicos pueden subir su firma"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'firmas-medicos'
    AND (storage.foldername(name))[1] = 'medicos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Medicos pueden actualizar su firma"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'firmas-medicos'
    AND (storage.foldername(name))[1] = 'medicos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Medicos pueden borrar su firma"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'firmas-medicos'
    AND (storage.foldername(name))[1] = 'medicos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- RLS: service_role puede leer (para generar PDF server-side)
-- No se necesita policy explícita: supabaseAdmin bypassa RLS
