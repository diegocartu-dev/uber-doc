-- Fix: RLS SELECT de turnos con scalar subquery para compatibilidad con Supabase Realtime
-- El IN (...) subquery causaba CHANNEL_ERROR en canales Realtime
DROP POLICY IF EXISTS "Médicos ven sus turnos" ON public.turnos;
CREATE POLICY "Médicos ven sus turnos"
  ON public.turnos FOR SELECT TO authenticated
  USING (
    medico_id = (SELECT id FROM public.medicos WHERE user_id = auth.uid())
  );
