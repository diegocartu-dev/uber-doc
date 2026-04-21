-- Migration 047: Reescribir trigger de auto-creación de perfiles
-- El trigger original (017) creaba médicos fantasma con matrícula vacía y precio 0.
-- Ahora SOLO crea pacientes. Médicos se crean exclusivamente desde el formulario.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'role' = 'paciente' THEN
    INSERT INTO public.pacientes (user_id, nombre_completo, email, dni, fecha_nacimiento, telefono)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      NEW.email,
      '',
      '2000-01-01',
      ''
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  -- Médicos: NO auto-crear. El registro pasa por formulario + verificación manual.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
