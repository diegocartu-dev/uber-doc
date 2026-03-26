-- Agregar columnas de disponibilidad a la tabla medicos
alter table public.medicos
  add column if not exists disponible boolean not null default false,
  add column if not exists disponible_desde time,
  add column if not exists disponible_hasta time;
