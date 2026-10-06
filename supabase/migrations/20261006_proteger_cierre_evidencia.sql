-- APLICADA en producción el 06/10/2026 (OK de Diego), verificada con una prueba
-- en transacción revertida. Solo en la base principal: la
-- instancia institucional no tiene estas columnas.
--
-- La caja negra del cierre (consultas.cierre_evidencia, turnos.cierre_evidencia)
-- la escribe SOLO el servidor (service role). Prueba del 06/10/2026, en una
-- transacción que se deshizo sola: un profesional logueado podía escribirla en
-- su propia consulta y en su propio turno (1 fila cada uno), y con eso marcar su
-- propia caída como "ya revisada" para que la alarma no sonara.
--
-- Mismo mecanismo que proteger_verificacion_medico: si la escritura viene de la
-- sesión de un usuario (rol authenticated o anon), la columna no cambia en un
-- UPDATE y nace vacía en un INSERT. El resto de la fila se escribe igual.

CREATE OR REPLACE FUNCTION public.proteger_cierre_evidencia()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('role', true) IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.cierre_evidencia := NULL;
    ELSIF OLD.cierre_evidencia IS DISTINCT FROM NEW.cierre_evidencia THEN
      NEW.cierre_evidencia := OLD.cierre_evidencia;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_cierre_evidencia ON public.consultas;
CREATE TRIGGER proteger_cierre_evidencia
  BEFORE INSERT OR UPDATE ON public.consultas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_cierre_evidencia();

DROP TRIGGER IF EXISTS proteger_cierre_evidencia ON public.turnos;
CREATE TRIGGER proteger_cierre_evidencia
  BEFORE INSERT OR UPDATE ON public.turnos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_cierre_evidencia();
