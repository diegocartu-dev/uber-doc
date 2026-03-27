-- Médicos pueden eliminar consultas asignadas a ellos (admin/testing)
create policy "Médicos pueden eliminar sus consultas"
  on public.consultas for delete
  using (
    medico_id in (
      select id from public.medicos where user_id = auth.uid()
    )
  );
