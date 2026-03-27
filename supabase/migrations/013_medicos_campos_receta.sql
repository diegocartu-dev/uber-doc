-- Campos adicionales para recetas médicas
alter table public.medicos
  add column if not exists cuit text,
  add column if not exists matricula_provincial text,
  add column if not exists provincia_matricula text;
