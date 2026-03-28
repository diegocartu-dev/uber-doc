-- CUIL en pacientes (Ley 27.553 recetas electrónicas)
alter table public.pacientes
  add column if not exists cuil text;

-- Domicilio en médicos (Ley 17.132 recetas médicas)
alter table public.medicos
  add column if not exists domicilio text;

-- Tiempo de síntomas en consultas
alter table public.consultas
  add column if not exists tiempo_sintomas text;
