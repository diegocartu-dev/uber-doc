-- Rediseño del registro (14/07/2026): el médico ya NO define precio/duración/
-- modalidad en el registro (registro = solo validación). Esos datos se setean
-- cuando configura su Consulta Inmediata y sus agendas (o desde el perfil).
-- Por eso las 3 columnas pasan de NOT NULL a nullable — nacen vacías y se
-- completan después. Un médico sin configurar no aparece en la clínica hasta
-- que elige cómo atiende (modelo nuevo). Los médicos existentes no se tocan.
ALTER TABLE public.medicos
  ALTER COLUMN precio_consulta    DROP NOT NULL,
  ALTER COLUMN duracion_consulta  DROP NOT NULL,
  ALTER COLUMN modalidad_atencion DROP NOT NULL;
