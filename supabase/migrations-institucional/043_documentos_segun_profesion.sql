-- 043 — espejo de `supabase/migrations/20261013_documentos_segun_profesion.sql`.

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
