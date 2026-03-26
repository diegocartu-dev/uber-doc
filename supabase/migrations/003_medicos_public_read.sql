-- Los usuarios autenticados pueden ver las especialidades y modalidades de los médicos
create policy "Usuarios autenticados pueden ver médicos"
  on public.medicos for select
  to authenticated
  using (true);
