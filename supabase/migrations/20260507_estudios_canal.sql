-- Sprint: Canal de Documentación en Consulta
-- Agrega columna estudios_links a consultas y crea bucket consultas-temp

-- 1. Columna para links de estudios del paciente
ALTER TABLE consultas
ADD COLUMN IF NOT EXISTS estudios_links TEXT[] DEFAULT '{}';

-- 2. Crear bucket privado para archivos temporales de estudios
INSERT INTO storage.buckets (id, name, public)
VALUES ('consultas-temp', 'consultas-temp', false)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS policies para el bucket consultas-temp

-- Paciente puede subir archivos a su propia consulta
CREATE POLICY "paciente_insert_estudios" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'consultas-temp'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM consultas
    WHERE paciente_id = auth.uid()
    AND estado IN ('esperando', 'aceptada', 'pagada', 'en_curso')
  )
);

-- Médico asignado puede ver archivos de su consulta + service role
CREATE POLICY "medico_select_estudios" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'consultas-temp'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM consultas c
      JOIN medicos m ON m.id = c.medico_id
      WHERE m.user_id = auth.uid()
    )
    OR (storage.foldername(name))[1] IN (
      SELECT id::text FROM consultas
      WHERE paciente_id = auth.uid()
    )
  )
);

-- Paciente dueño puede borrar sus propios archivos
CREATE POLICY "paciente_delete_estudios" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'consultas-temp'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM consultas
    WHERE paciente_id = auth.uid()
  )
);
