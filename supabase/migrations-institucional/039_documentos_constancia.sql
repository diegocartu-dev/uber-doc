-- 039 — espejo de `supabase/migrations/20261013_documentos_constancia.sql`.

ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_tipo_check;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_tipo_check
  CHECK (tipo = ANY (ARRAY['receta'::text, 'indicaciones'::text, 'certificado'::text, 'orden'::text, 'constancia'::text]));
