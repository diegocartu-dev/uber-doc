-- Agrega canal_origen a agenda_modelos para mostrar el badge de canal
-- en la lista de modelos sin necesidad de inferirlo desde los turnos.
-- Los modelos existentes quedan en 'clinica_virtual' por default.
ALTER TABLE public.agenda_modelos
  ADD COLUMN canal_origen text NOT NULL DEFAULT 'clinica_virtual'
  CHECK (canal_origen IN ('clinica_virtual', 'consultorio_privado'));
