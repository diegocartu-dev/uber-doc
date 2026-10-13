-- =============================================================================
-- Qué documento emite cada profesión, en la base (13/10/2026).
--
-- El psicólogo emite solo la constancia de atención; el médico, nunca. La
-- aplicación ya lo respeta, pero si un día la lectura de la profesión fallara
-- (la aplicación trata ese caso como "médico"), o alguien insertara directo
-- con su sesión (la policy de INSERT de `documentos` solo mira el `medico_id`),
-- la base lo frena igual.
--
-- SECURITY DEFINER: la profesión se lee aunque la RLS de `medicos` no deje ver
-- la fila a quien inserta (sin eso fallaría "abierto", como médico).
--
-- Y una sola constancia por turno: dos pestañas no la duplican.
-- Va también a la base institucional (migrations-institucional/043).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.documento_segun_profesion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prof text;
BEGIN
  SELECT profesion INTO prof FROM public.medicos WHERE id = NEW.medico_id;
  IF prof = 'psicologo' AND NEW.tipo IS DISTINCT FROM 'constancia' THEN
    RAISE EXCEPTION 'documento_no_permitido: en psicología se emite solo la constancia de atención'
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(prof, 'medico') <> 'psicologo' AND NEW.tipo = 'constancia' THEN
    RAISE EXCEPTION 'documento_no_permitido: la constancia de atención es solo de psicología'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documento_segun_profesion ON public.documentos;
CREATE TRIGGER trg_documento_segun_profesion
  BEFORE INSERT OR UPDATE OF tipo, medico_id ON public.documentos
  FOR EACH ROW EXECUTE FUNCTION public.documento_segun_profesion();

CREATE UNIQUE INDEX IF NOT EXISTS documentos_una_constancia_por_turno
  ON public.documentos (turno_id) WHERE tipo = 'constancia';
