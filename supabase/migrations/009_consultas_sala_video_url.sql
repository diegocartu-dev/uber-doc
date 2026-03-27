-- URL de la sala de videollamada creada por el médico
alter table public.consultas
  add column if not exists sala_video_url text;
