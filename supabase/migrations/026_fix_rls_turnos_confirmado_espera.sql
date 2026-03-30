-- Fix: permitir a pacientes cambiar su turno de "confirmado" a "en_espera"
DROP POLICY IF EXISTS "Pacientes reservan turnos disponibles" ON public.turnos;
CREATE POLICY "Pacientes actualizan sus turnos"
  ON public.turnos FOR UPDATE TO authenticated
  USING (
    estado = 'disponible'
    OR (estado IN ('reservado_pendiente', 'confirmado') AND paciente_id IN (
      SELECT id FROM public.pacientes WHERE user_id = auth.uid()
    ))
  )
  WITH CHECK (
    paciente_id IN (SELECT id FROM public.pacientes WHERE user_id = auth.uid())
  );
