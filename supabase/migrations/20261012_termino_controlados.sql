-- Término aparte de medicamentos controlados (decisión Diego, 12/10/2026).
--
-- "Por Docto se puede recetar cualquier medicamento, excepto psicotrópicos y
-- estupefacientes (Leyes 19.303 y 17.818)." Lo tildan el paciente antes de
-- pagar cada consulta y el profesional una vez. Cada tilde queda en
-- aceptaciones_legales con la versión exacta del texto (código:
-- src/lib/legal/controlados.ts).
--
-- Los nombres de las restricciones se leyeron de pg_constraint en las dos bases
-- el 12/10 (no se suponen): versiones_textos_legales_tipo_check y
-- aceptaciones_legales_tipo_check.

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
