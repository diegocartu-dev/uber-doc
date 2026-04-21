-- Migration 048: RLS — pacientes solo ven médicos verificados y aprobados
-- Médicos siempre ven su propio perfil (para ver estado de verificación en dashboard).

DROP POLICY IF EXISTS "Usuarios autenticados ven perfiles de medicos" ON public.medicos;

CREATE POLICY "Usuarios autenticados ven perfiles de medicos"
  ON public.medicos FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      verificado = true
      AND estado_registro = 'aprobado'
      AND oculto_clinica = false
    )
  );
