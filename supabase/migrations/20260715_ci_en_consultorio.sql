-- CI en el consultorio particular = opt-in explícito del médico (decisión Diego
-- 15/07: "sí, pero se activa solo con un tilde que lo incluya"). Reemplaza el
-- gate legacy por modalidad_atencion (NULL en médicos del registro nuevo → CI
-- nunca disponible en su consultorio).
-- DEFAULT false = nadie queda activado sin elegirlo (regla "nada prellenado").
ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS ci_en_consultorio boolean NOT NULL DEFAULT false;

-- Grants de columna (recordar: columna nueva NO hereda los grants por-columna de
-- la tabla; sin esto, el UPDATE del médico vía cliente RLS fallaría ENTERO).
-- No es PII: es una preferencia de canal.
GRANT SELECT (ci_en_consultorio) ON public.medicos TO authenticated;
GRANT UPDATE (ci_en_consultorio) ON public.medicos TO authenticated;
