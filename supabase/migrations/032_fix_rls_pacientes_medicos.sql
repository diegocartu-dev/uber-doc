-- Fix A: RLS pacientes — limpiar condición muerta en policy de médicos
-- La condición `id IN (SELECT c.paciente_id FROM consultas...)` nunca matchea
-- porque consultas.paciente_id = auth.users.id y pacientes.id es UUID interno.

DROP POLICY IF EXISTS "Medicos pueden ver pacientes de sus consultas y turnos" ON public.pacientes;

CREATE POLICY "Medicos ven pacientes de consultas y turnos"
  ON public.pacientes FOR SELECT TO authenticated
  USING (
    -- Paciente se ve a sí mismo
    user_id = auth.uid()
    OR
    -- Médico ve pacientes de consultas inmediatas (consultas.paciente_id = auth.users.id = pacientes.user_id)
    user_id IN (
      SELECT c.paciente_id FROM public.consultas c
      INNER JOIN public.medicos m ON c.medico_id = m.id
      WHERE m.user_id = auth.uid()
    )
    OR
    -- Médico ve pacientes de turnos programados (turnos.paciente_id = pacientes.id)
    id IN (
      SELECT t.paciente_id FROM public.turnos t
      INNER JOIN public.medicos m ON t.medico_id = m.id
      WHERE m.user_id = auth.uid()
    )
  );

-- Fix B: RLS medicos — pacientes necesitan ver perfiles de médicos
-- Sin esta policy, /clinica no muestra médicos y /clinica/[medicoId]/turnos redirige.
-- Los perfiles de médicos son información pública dentro de la app.

CREATE POLICY "Usuarios autenticados ven perfiles de medicos"
  ON public.medicos FOR SELECT TO authenticated
  USING (true);

-- Eliminar policies viejas redundantes
DROP POLICY IF EXISTS "Médicos pueden ver su propio perfil" ON public.medicos;
DROP POLICY IF EXISTS "Lectura publica de medicos" ON public.medicos;
