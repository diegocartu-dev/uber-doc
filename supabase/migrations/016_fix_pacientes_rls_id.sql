-- Fix RLS: cubrir ambos casos de referencia (user_id y id)
drop policy if exists "Médicos pueden ver pacientes de sus consultas" on public.pacientes;

create policy "Médicos pueden ver pacientes de sus consultas"
  on public.pacientes for select
  to authenticated
  using (
    user_id in (
      select c.paciente_id from public.consultas c
      inner join public.medicos m on c.medico_id = m.id
      where m.user_id = auth.uid()
    )
    or
    id in (
      select c.paciente_id from public.consultas c
      inner join public.medicos m on c.medico_id = m.id
      where m.user_id = auth.uid()
    )
  );
