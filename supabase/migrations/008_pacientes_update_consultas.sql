-- Pacientes pueden actualizar sus propias consultas (necesario para cambio de estado post-pago)
create policy "Pacientes pueden actualizar sus consultas"
  on public.consultas for update
  using (auth.uid() = paciente_id);
