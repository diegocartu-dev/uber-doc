DROP POLICY IF EXISTS "Pacientes reservan turnos disponibles" ON public.turnos;
CREATE POLICY "Pacientes reservan turnos disponibles"
  ON public.turnos FOR UPDATE TO authenticated
  USING (estado = 'disponible')
  WITH CHECK (
    paciente_id IN (SELECT id FROM public.pacientes WHERE user_id = auth.uid())
  );
