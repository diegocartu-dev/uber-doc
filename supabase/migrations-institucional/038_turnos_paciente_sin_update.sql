-- 038 — espejo de `supabase/migrations/20261013_turnos_paciente_sin_update.sql`.
--
-- En la instancia el paciente no reserva (asigna el otorgador), pero la policy
-- existe igual y deja el mismo UPDATE directo. Se saca también.

DROP POLICY IF EXISTS "Pacientes actualizan sus turnos" ON public.turnos;
