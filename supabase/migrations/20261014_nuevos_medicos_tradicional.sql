-- 20261014_nuevos_medicos_tradicional.sql
-- Decisión de Diego (14/10/2026): se cierra el ingreso de fundadores. Todo
-- profesional que se registre desde hoy entra como Tradicional (10 %). Los que
-- ya tienen ficha conservan su categoría.
--
-- Hasta hoy el "régimen de nuevos médicos" del admin (Configuración → Comisiones)
-- no lo leía nadie: la ficha nacía 'founder' por el DEFAULT de la columna. Este
-- trigger hace que el régimen mande en cada ficha nueva, venga de donde venga el
-- INSERT (el trigger de auth incluido), y pisa cualquier valor que traiga el
-- INSERT: nadie elige su propia categoría al nacer.
--
-- Solo base principal: la instancia institucional no cobra por Mercado Pago y
-- no lee la categoría.

CREATE OR REPLACE FUNCTION public.asignar_categoria_nuevo_medico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.categoria := COALESCE(
    (SELECT categoria_actual FROM public.regimen_nuevos_medicos WHERE id = 1),
    'tradicional'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_categoria_nuevo_medico() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_asignar_categoria_nuevo_medico ON public.medicos;
CREATE TRIGGER trg_asignar_categoria_nuevo_medico
  BEFORE INSERT ON public.medicos
  FOR EACH ROW EXECUTE FUNCTION public.asignar_categoria_nuevo_medico();

-- Red por si algún día falta la fila del régimen o se saca el trigger.
ALTER TABLE public.medicos ALTER COLUMN categoria SET DEFAULT 'tradicional';

UPDATE public.regimen_nuevos_medicos
  SET categoria_actual = 'tradicional', ultima_modificacion = now()
  WHERE id = 1;
