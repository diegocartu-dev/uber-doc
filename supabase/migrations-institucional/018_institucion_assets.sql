-- 018_institucion_assets.sql — el bucket de los assets de marca de la instancia.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 001_institucion_config.sql (de ahí salen `logo_path` y
-- `pdf_isologo_path`, que hasta esta migración apuntaban a un bucket que no
-- existía).
--
-- ── QUÉ HABILITA ─────────────────────────────────────────────────────────────
-- El isologo del encabezado del documento institucional (spec §7.1, 03-spec
-- §3.1): `institucion_config.pdf_isologo_path` guarda la ruta DENTRO de este
-- bucket y `src/lib/institucional/branding-pdf.ts` la baja con service role
-- para meterla en el PDF. El logo del chrome (`logo_path`) vive acá también,
-- para el día que el panel y el turnero lo pinten (hoy siguen con el hueco
-- reservado del mock).
--
-- ── POR QUÉ PÚBLICO ──────────────────────────────────────────────────────────
-- Porque es el logotipo institucional de un organismo público: ya está en su
-- sitio, en su papelería y en el mensaje de WhatsApp que recibe el paciente. No
-- hay nada que proteger, y un bucket privado obligaría a firmar una URL para
-- pintar una imagen en cada pantalla. Acá NO va ningún dato de personas: los
-- documentos clínicos, las credenciales y las firmas tienen sus propios buckets
-- privados, y ninguno se toca.
--
-- ESCRITURA: solo service role. La subida la hace el /admin interno de Docto
-- (no la institución), que es quien provisiona la instancia.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'institucion-assets',
  'institucion-assets',
  true,
  2097152,  -- 2 MB: un isologo que pese más es un error de carga, no un isologo
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública (es un logotipo). Sin policies de INSERT/UPDATE/DELETE: el
-- service role no pasa por RLS y nadie más escribe acá.
DROP POLICY IF EXISTS "institucion_assets_lectura_publica" ON storage.objects;
CREATE POLICY "institucion_assets_lectura_publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'institucion-assets');
