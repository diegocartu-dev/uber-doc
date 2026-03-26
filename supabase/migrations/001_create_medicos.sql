-- Tabla de médicos para Uber Doc
create table if not exists public.medicos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  nombre_completo text not null,
  email text not null unique,
  especialidad text not null,
  tipo_matricula text not null check (tipo_matricula in ('MN', 'MP')),
  numero_matricula text not null,
  provincia text,
  precio_consulta integer not null check (precio_consulta > 0),
  duracion_consulta integer not null check (duracion_consulta in (20, 30, 45)),
  modalidad_atencion text not null check (modalidad_atencion in ('programada', 'inmediata', 'ambas')),
  created_at timestamptz default now() not null
);

-- Habilitar RLS
alter table public.medicos enable row level security;

-- Política: los médicos pueden ver su propio registro
create policy "Médicos pueden ver su propio perfil"
  on public.medicos for select
  using (auth.uid() = user_id);

-- Política: los médicos pueden insertar su propio registro
create policy "Médicos pueden crear su perfil"
  on public.medicos for insert
  with check (auth.uid() = user_id);

-- Política: los médicos pueden actualizar su propio registro
create policy "Médicos pueden actualizar su perfil"
  on public.medicos for update
  using (auth.uid() = user_id);
