-- Agregar estado "pagada" al check constraint de consultas
ALTER TABLE public.consultas DROP CONSTRAINT IF EXISTS consultas_estado_check;
ALTER TABLE public.consultas ADD CONSTRAINT consultas_estado_check
  CHECK (estado IN ('esperando', 'aceptada', 'pagada', 'en_curso', 'completada', 'cancelada'));
