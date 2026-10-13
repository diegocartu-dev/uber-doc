-- =============================================================================
-- Psicólogos, F3: la constancia de atención (13/10/2026).
-- Decisión y texto aprobado: docs/sprints/2026-10-13-psicologos.md.
--
-- El psicólogo emite la evolución (historia clínica, ya existía) y una
-- constancia de atención. Nunca receta, orden, certificado ni indicaciones.
-- La constancia es un tipo nuevo de documento, firmable como los demás; su
-- texto completo (paciente, fecha, profesional, matrícula y domicilio) va en
-- `contenido`, que entra al hash de la firma.
--
-- Va también a la base institucional (migrations-institucional/039): la tabla
-- es compartida y el PDF y la firma son código compartido.
-- =============================================================================

ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_tipo_check;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_tipo_check
  CHECK (tipo = ANY (ARRAY['receta'::text, 'indicaciones'::text, 'certificado'::text, 'orden'::text, 'constancia'::text]));
