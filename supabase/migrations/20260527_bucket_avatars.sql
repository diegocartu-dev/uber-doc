-- ============================================================================
-- Migracion: Bucket avatars para fotos de perfil de medicos
-- Sprint: Post-QA E2E 27/05
-- Fecha: 2026-05-27
-- ============================================================================
-- Bug encontrado en QA: el codigo en /api/medico/foto/route.ts referencia
-- bucket 'avatars' pero nunca se creo via migracion. Se creo manualmente
-- durante QA. Esta migracion formaliza la creacion con RLS correcto.
--
-- El bucket es PUBLICO (lectura sin auth) porque las fotos de perfil se
-- muestran en el listado de medicos, perfil publico /dr/[slug], y cards
-- de consulta. No contienen datos sensibles.
--
-- Path: medicos/{user_id}/perfil.{ext}
-- ============================================================================

-- Crear bucket publico para fotos de perfil
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: medico autenticado puede subir su propia foto
-- Path esperado: medicos/{user_id}/perfil.{ext}
CREATE POLICY "Medicos pueden subir su foto de perfil"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'medicos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- RLS: medico puede actualizar (reemplazar) su foto
CREATE POLICY "Medicos pueden actualizar su foto de perfil"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'medicos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- RLS: medico puede borrar su foto
CREATE POLICY "Medicos pueden borrar su foto de perfil"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'medicos'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- RLS: lectura publica — bucket es public, no necesita policy de SELECT
-- Supabase sirve objetos de buckets publicos sin auth via URL directa.
-- Si en el futuro se cambia a bucket privado, agregar policy SELECT aqui.
