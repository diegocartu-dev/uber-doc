-- Agregar fecha de aceptación de términos
alter table public.pacientes
  add column if not exists terminos_aceptados_at timestamptz;

alter table public.medicos
  add column if not exists terminos_aceptados_at timestamptz,
  add column if not exists declaracion_matricula_at timestamptz;
