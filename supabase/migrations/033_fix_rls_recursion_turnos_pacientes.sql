-- Fix: Recursión infinita en RLS turnos ↔ pacientes
--
-- PROBLEMA: La policy de pacientes referenciaba turnos, y la de turnos
-- referenciaba pacientes, creando un loop infinito:
--   turnos RLS → pacientes RLS → turnos RLS → ♻️
--
-- SOLUCIÓN: Función SECURITY DEFINER que resuelve paciente_id del usuario
-- actual SIN pasar por RLS de pacientes, rompiendo el ciclo.

-- 1. Función helper (SECURITY DEFINER = bypasea RLS)
CREATE OR REPLACE FUNCTION public.paciente_id_for_current_user()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM public.pacientes WHERE user_id = auth.uid()
$$;

-- 2. Reescribir SELECT de turnos para pacientes (usa función, no tabla)
DROP POLICY IF EXISTS "Pacientes ven turnos disponibles y propios" ON public.turnos;
CREATE POLICY "Pacientes ven turnos disponibles y propios"
  ON public.turnos FOR SELECT TO authenticated
  USING (
    estado = 'disponible'
    OR paciente_id = public.paciente_id_for_current_user()
  );

-- 3. Reescribir UPDATE de turnos para pacientes (usa función, no tabla)
DROP POLICY IF EXISTS "Pacientes reservan turnos disponibles" ON public.turnos;
DROP POLICY IF EXISTS "Pacientes actualizan sus turnos" ON public.turnos;
CREATE POLICY "Pacientes actualizan sus turnos"
  ON public.turnos FOR UPDATE TO authenticated
  USING (
    estado = 'disponible'
    OR (estado IN ('reservado_pendiente', 'confirmado')
        AND paciente_id = public.paciente_id_for_current_user())
  )
  WITH CHECK (
    paciente_id = public.paciente_id_for_current_user()
  );
