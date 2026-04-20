-- Fix: permitir crear paciente en auth callback con datos mínimos
-- Los campos se completan en onboarding después del registro

-- 1. Hacer nullable los campos que se llenan en onboarding
ALTER TABLE public.pacientes ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.pacientes ALTER COLUMN dni DROP NOT NULL;
ALTER TABLE public.pacientes ALTER COLUMN fecha_nacimiento DROP NOT NULL;
ALTER TABLE public.pacientes ALTER COLUMN telefono DROP NOT NULL;
ALTER TABLE public.pacientes ALTER COLUMN nombre_completo DROP NOT NULL;

-- 2. Reemplazar UNIQUE de dni con partial unique (solo cuando dni no es null/vacío)
ALTER TABLE public.pacientes DROP CONSTRAINT IF EXISTS pacientes_email_key;
ALTER TABLE public.pacientes DROP CONSTRAINT IF EXISTS pacientes_dni_key;

CREATE UNIQUE INDEX IF NOT EXISTS pacientes_email_unique
  ON public.pacientes (email) WHERE email IS NOT NULL AND email != '';

CREATE UNIQUE INDEX IF NOT EXISTS pacientes_dni_unique
  ON public.pacientes (dni) WHERE dni IS NOT NULL AND dni != '';

NOTIFY pgrst, 'reload schema';
