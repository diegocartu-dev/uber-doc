-- Reemplazar policy permisiva: pacientes solo pueden cancelar consultas en espera
DROP POLICY IF EXISTS "Pacientes pueden actualizar sus consultas" ON public.consultas;

CREATE POLICY "Pacientes pueden cancelar sus consultas en espera"
  ON public.consultas FOR UPDATE
  TO authenticated
  USING (auth.uid() = paciente_id AND estado = 'esperando')
  WITH CHECK (estado = 'cancelada');
