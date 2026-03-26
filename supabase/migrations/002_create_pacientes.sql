-- Tabla de pacientes para Uber Doc
create table if not exists public.pacientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  nombre_completo text not null,
  email text not null unique,
  dni text not null unique,
  fecha_nacimiento date not null,
  telefono text not null,
  created_at timestamptz default now() not null
);

-- Habilitar RLS
alter table public.pacientes enable row level security;

-- Política: los pacientes pueden ver su propio registro
create policy "Pacientes pueden ver su propio perfil"
  on public.pacientes for select
  using (auth.uid() = user_id);

-- Política: los pacientes pueden insertar su propio registro
create policy "Pacientes pueden crear su perfil"
  on public.pacientes for insert
  with check (auth.uid() = user_id);

-- Política: los pacientes pueden actualizar su propio registro
create policy "Pacientes pueden actualizar su perfil"
  on public.pacientes for update
  using (auth.uid() = user_id);
