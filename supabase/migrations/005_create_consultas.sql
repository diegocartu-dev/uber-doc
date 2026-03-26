-- Tabla de consultas para Uber Doc
create table if not exists public.consultas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid references auth.users(id) on delete cascade not null,
  medico_id uuid references public.medicos(id) on delete cascade not null,
  especialidad text not null,
  estado text not null default 'esperando' check (estado in ('esperando', 'aceptada', 'en_curso', 'completada', 'cancelada')),
  created_at timestamptz default now() not null
);

-- Habilitar RLS
alter table public.consultas enable row level security;

-- Pacientes pueden ver sus propias consultas
create policy "Pacientes pueden ver sus consultas"
  on public.consultas for select
  using (auth.uid() = paciente_id);

-- Pacientes pueden crear consultas
create policy "Pacientes pueden crear consultas"
  on public.consultas for insert
  with check (auth.uid() = paciente_id);

-- Médicos pueden ver consultas asignadas a ellos
create policy "Médicos pueden ver sus consultas"
  on public.consultas for select
  using (
    medico_id in (
      select id from public.medicos where user_id = auth.uid()
    )
  );

-- Médicos pueden actualizar consultas asignadas a ellos
create policy "Médicos pueden actualizar sus consultas"
  on public.consultas for update
  using (
    medico_id in (
      select id from public.medicos where user_id = auth.uid()
    )
  );
