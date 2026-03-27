-- Tabla de documentos clínicos
create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid references public.consultas(id) on delete cascade not null,
  paciente_id uuid references public.pacientes(id) not null,
  medico_id uuid references public.medicos(id) not null,
  tipo text not null check (tipo in ('receta', 'indicaciones', 'certificado')),
  diagnostico text not null,
  contenido text not null,
  pdf_url text,
  created_at timestamptz default now() not null
);

alter table public.documentos enable row level security;

create policy "Pacientes ven sus documentos"
  on public.documentos for select to authenticated
  using (paciente_id = (select id from public.pacientes where user_id = auth.uid()));

create policy "Médicos ven documentos de sus consultas"
  on public.documentos for select to authenticated
  using (medico_id = (select id from public.medicos where user_id = auth.uid()));

create policy "Médicos insertan documentos"
  on public.documentos for insert to authenticated
  with check (medico_id = (select id from public.medicos where user_id = auth.uid()));
