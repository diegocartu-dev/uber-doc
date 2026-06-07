-- Fix: RLS de consultas INSERT — universo del carril de prueba (es_cuenta_test).
-- YA APLICADA en prod (07/06/2026, autorizada por Diego).
--
-- GAP del carril (#167): la RLS "Pacientes pueden crear consultas" hardcodeaba
-- m.es_cuenta_test = false → un paciente test no podía crear CI con un médico test.
--
-- Fix: la RLS espeja el guard de la app (médico en el MISMO universo que el paciente).
-- IMPORTANTE: el lookup de es_cuenta_test del paciente va por una función
-- SECURITY DEFINER. Un subquery directo a `pacientes` dentro de la policy dispara
-- el RLS de pacientes → recursión infinita (42P17) que rompe la INSERT para TODOS.
-- La función SECURITY DEFINER lee es_cuenta_test sin disparar RLS → corta el ciclo.

CREATE OR REPLACE FUNCTION public.paciente_es_test(p_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $f$
  SELECT COALESCE((SELECT es_cuenta_test FROM pacientes WHERE user_id = p_uid LIMIT 1), false)
$f$;

ALTER POLICY "Pacientes pueden crear consultas" ON consultas
WITH CHECK (
  (auth.uid() = paciente_id) AND EXISTS (
    SELECT 1 FROM medicos m
    WHERE m.id = consultas.medico_id
      AND m.disponible = true
      AND m.verificado = true
      AND m.estado_registro = 'aprobado'
      AND m.es_cuenta_test = public.paciente_es_test(auth.uid())
  )
);
