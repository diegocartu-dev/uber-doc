-- Agregar columnas de triage a la tabla consultas
alter table public.consultas
  add column if not exists motivo_consulta text,
  add column if not exists sintomas text[];
