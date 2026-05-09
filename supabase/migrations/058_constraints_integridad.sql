-- 058_constraints_integridad.sql
-- DNI unico en pacientes + funciones de deteccion de duplicados.

-- Verificar duplicados antes de aplicar constraint
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM (
    SELECT dni FROM public.pacientes
    WHERE dni IS NOT NULL AND dni != ''
    GROUP BY dni
    HAVING COUNT(*) > 1
  ) dups;

  IF v_count > 0 THEN
    RAISE NOTICE 'DUPLICADOS DETECTADOS: % grupos de DNI duplicados en pacientes. NO se aplica UNIQUE constraint hasta resolver duplicados desde panel admin.', v_count;
  ELSE
    RAISE NOTICE 'Sin duplicados de DNI. Aplicando UNIQUE constraint.';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_pacientes_dni_unique ON public.pacientes(dni) WHERE dni IS NOT NULL AND dni != ''''';
  END IF;
END $$;

-- Funciones helper para deteccion de duplicados desde panel admin
CREATE OR REPLACE FUNCTION public.detectar_dnis_duplicados()
RETURNS TABLE(dni TEXT, cantidad INT, paciente_ids UUID[]) AS $$
  SELECT p.dni, COUNT(*)::INT, ARRAY_AGG(p.id) AS paciente_ids
  FROM public.pacientes p
  WHERE p.dni IS NOT NULL AND p.dni != ''
  GROUP BY p.dni
  HAVING COUNT(*) > 1;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.detectar_matriculas_duplicadas()
RETURNS TABLE(numero_matricula TEXT, tipo_matricula TEXT, cantidad INT, medico_ids UUID[]) AS $$
  SELECT m.numero_matricula, m.tipo_matricula, COUNT(*)::INT, ARRAY_AGG(m.id)
  FROM public.medicos m
  GROUP BY m.numero_matricula, m.tipo_matricula
  HAVING COUNT(*) > 1;
$$ LANGUAGE sql SECURITY DEFINER;
