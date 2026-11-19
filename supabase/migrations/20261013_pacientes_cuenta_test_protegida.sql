-- =============================================================================
-- `pacientes.es_cuenta_test` no se escribe con la sesión del usuario (13/10/2026).
--
-- Probado en producción, en una transacción que se deshizo y con cuentas de
-- prueba: un paciente real, con su propia sesión (la clave pública está en el
-- navegador), se cambiaba `es_cuenta_test` a true por un UPDATE directo. Con esa
-- marca, el pago se SIMULA (`lib/pago-test.ts`: "las cuentas de test siempre
-- simulan"): turno confirmado o consulta pagada sin pagar nada. La policy
-- "Pacientes pueden actualizar su propio registro" y el permiso de UPDATE
-- sobre toda la tabla lo dejaban; en `medicos` esa columna ya la protege
-- `proteger_verificacion_medico`, en `pacientes` no había nada.
--
-- Las fichas de paciente las crea la aplicación con service role, y las
-- cuentas de prueba se marcan desde el servidor: para la sesión del usuario
-- (paciente o médico, que también puede actualizar la cobertura de sus
-- pacientes) la marca queda como estaba en un UPDATE y en false en un INSERT.
--
-- Va también a la base institucional (migrations-institucional/040).
-- =============================================================================

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
