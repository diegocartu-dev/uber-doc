-- 041 — espejo de `supabase/migrations/20261013_consultas_paciente_sin_escritura.sql`.

DROP POLICY IF EXISTS "Pacientes pueden crear consultas" ON public.consultas;
DROP POLICY IF EXISTS "Pacientes pueden cancelar sus consultas en espera" ON public.consultas;
