-- Cambiar FK de documentos para evitar borrado en cascada de registros clinicos

-- consulta_id: ON DELETE CASCADE -> ON DELETE RESTRICT
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_consulta_id_fkey;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_consulta_id_fkey
  FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE RESTRICT;

-- turno_id: ON DELETE CASCADE -> ON DELETE RESTRICT
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_turno_id_fkey;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_turno_id_fkey
  FOREIGN KEY (turno_id) REFERENCES public.turnos(id) ON DELETE RESTRICT;
