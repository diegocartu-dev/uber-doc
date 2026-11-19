-- 040 — espejo de `supabase/migrations/20261013_pacientes_cuenta_test_protegida.sql`.

CREATE OR REPLACE FUNCTION public.proteger_cuenta_test_paciente()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('role', true) IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.es_cuenta_test := false;
    ELSIF OLD.es_cuenta_test IS DISTINCT FROM NEW.es_cuenta_test THEN
      NEW.es_cuenta_test := OLD.es_cuenta_test;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_cuenta_test_paciente ON public.pacientes;
CREATE TRIGGER trg_proteger_cuenta_test_paciente
  BEFORE INSERT OR UPDATE ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.proteger_cuenta_test_paciente();
