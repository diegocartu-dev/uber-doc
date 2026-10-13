-- 035 — espejo de `supabase/migrations/20261012_termino_controlados.sql`.
--
-- `aceptaciones_legales` y `versiones_textos_legales` son tablas compartidas.
-- El término solo se muestra en el B2C (la instancia es marca blanca), pero las
-- restricciones, la columna y la versión se espejan igual, por la regla de este
-- README: si mañana alguien saca el corte, nada falla. Aplicada el 12/10/2026.

ALTER TABLE public.versiones_textos_legales DROP CONSTRAINT IF EXISTS versiones_textos_legales_tipo_check;
ALTER TABLE public.versiones_textos_legales ADD CONSTRAINT versiones_textos_legales_tipo_check
  CHECK (tipo = ANY (ARRAY['ci','tyc_paciente','tyc_medico','privacidad','datos_sensibles','controlados']));

ALTER TABLE public.aceptaciones_legales DROP CONSTRAINT IF EXISTS aceptaciones_legales_tipo_check;
ALTER TABLE public.aceptaciones_legales ADD CONSTRAINT aceptaciones_legales_tipo_check
  CHECK (tipo = ANY (ARRAY['ci','tyc_paciente','tyc_medico','privacidad','datos_sensibles','controlados']));

-- El paciente de un turno tilda antes de pagar: la fila guarda el turno, como
-- la de la consulta inmediata guarda la consulta.
ALTER TABLE public.aceptaciones_legales ADD COLUMN IF NOT EXISTS turno_id UUID;

-- Versión 1 del texto. Tiene que ser IGUAL a CONTROLADOS_TEXTO_COMPLETO
-- (título + línea en blanco + texto); el test controlados.test.ts lo compara.
INSERT INTO public.versiones_textos_legales (tipo, version, texto_completo, hash_sha256)
VALUES (
  'controlados',
  'controlados_v1',
  E'Medicamentos controlados\n\nPor Docto se puede recetar cualquier medicamento, excepto psicotrópicos y estupefacientes (Leyes 19.303 y 17.818). Esos no se recetan por la plataforma.',
  encode(sha256(convert_to(E'Medicamentos controlados\n\nPor Docto se puede recetar cualquier medicamento, excepto psicotrópicos y estupefacientes (Leyes 19.303 y 17.818). Esos no se recetan por la plataforma.', 'UTF8')), 'hex')
)
ON CONFLICT (tipo, version) DO NOTHING;
