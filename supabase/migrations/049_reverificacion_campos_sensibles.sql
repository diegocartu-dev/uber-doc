-- Migration 049: Re-verificación automática al modificar campos sensibles
-- Si un médico aprobado cambia matrícula, DNI o tipo, vuelve a pendiente.

CREATE OR REPLACE FUNCTION public.reverificar_medico()
RETURNS trigger AS $$
BEGIN
  IF OLD.verificado = true AND (
    OLD.numero_matricula IS DISTINCT FROM NEW.numero_matricula
    OR OLD.tipo_matricula IS DISTINCT FROM NEW.tipo_matricula
    OR OLD.dni IS DISTINCT FROM NEW.dni
    OR OLD.provincia_matricula IS DISTINCT FROM NEW.provincia_matricula
  ) THEN
    NEW.verificado := false;
    NEW.estado_registro := 'pendiente_revision';
    NEW.verificado_at := NULL;
    NEW.verificado_por := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reverificar_medico ON public.medicos;

CREATE TRIGGER trg_reverificar_medico
  BEFORE UPDATE ON public.medicos
  FOR EACH ROW
  EXECUTE FUNCTION public.reverificar_medico();
