-- 20260620_biometria_exenta.sql
-- Exención de validación biométrica (Didit) para médicos fundadores.
-- El gate de identidad (identidad_gate_activa) bloquea a los médicos con
-- identidad_validada=false en 7 puntos (página pública, consultorio, listado de
-- clínica, turnos, CI, dashboard). Esta bandera exime a médicos puntuales (grandfathering)
-- SIN mentir sobre identidad_validada (que sigue indicando "pasó por Didit").
-- El gate pasa a: flag ON && !identidad_validada && !biometria_exenta.

ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS biometria_exenta BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.medicos.biometria_exenta IS
  'Médico eximido de la validación biométrica (Didit) — grandfathering de fundadores. Distinto de identidad_validada (que indica que SÍ pasó por Didit).';

-- Eximir a los 2 médicos fundadores (Carina Gianserra, Pablo Cogliandro) por email
-- (identificador estable). Tienen el resto de los datos completos.
UPDATE public.medicos SET biometria_exenta = true
  WHERE email IN ('paancogliandro@gmail.com', 'doctoracaru@hotmail.com');
