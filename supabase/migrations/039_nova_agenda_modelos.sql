-- Nova: marcar modelos creados automáticamente para distinguirlos de los manuales.
ALTER TABLE public.agenda_modelos
  ADD COLUMN IF NOT EXISTS creado_por_nova boolean NOT NULL DEFAULT false;
