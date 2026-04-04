-- BUG A Fix: medico no ve nombre de pacientes en historial de turnos
-- La RLS de pacientes solo permitia ver pacientes vinculados por consultas.
-- Faltaba incluir pacientes vinculados por turnos programados.

DROP POLICY IF EXISTS "Médicos pueden ver pacientes de sus consultas" ON public.pacientes;

CREATE POLICY "Medicos pueden ver pacientes de sus consultas y turnos"
  ON public.pacientes FOR SELECT
  TO authenticated
  USING (
    -- Pacientes de consultas inmediatas (consultas.paciente_id = auth.users.id)
    user_id IN (
      SELECT c.paciente_id FROM public.consultas c
      INNER JOIN public.medicos m ON c.medico_id = m.id
      WHERE m.user_id = auth.uid()
    )
    OR
    id IN (
      SELECT c.paciente_id FROM public.consultas c
      INNER JOIN public.medicos m ON c.medico_id = m.id
      WHERE m.user_id = auth.uid()
    )
    OR
    -- Pacientes de turnos programados (turnos.paciente_id = pacientes.id)
    id IN (
      SELECT t.paciente_id FROM public.turnos t
      INNER JOIN public.medicos m ON t.medico_id = m.id
      WHERE m.user_id = auth.uid()
    )
  );
