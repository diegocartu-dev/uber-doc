-- Campos clínicos adicionales para pacientes (dni y telefono ya existen)
alter table public.pacientes
  add column if not exists obra_social text,
  add column if not exists nro_afiliado text;
