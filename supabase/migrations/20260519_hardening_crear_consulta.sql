-- Hardening: validar médico disponible+verificado+aprobado+no test al crear consulta CI
-- Safety net a nivel Postgres — complementa la validación en código de crearConsulta()

DROP POLICY IF EXISTS "Pacientes pueden crear consultas" ON public.consultas;

CREATE POLICY "Pacientes pueden crear consultas"
  ON public.consultas FOR INSERT
  WITH CHECK (
    auth.uid() = paciente_id
    AND EXISTS (
      SELECT 1 FROM public.medicos m
      WHERE m.id = medico_id
        AND m.disponible = true
        AND m.verificado = true
        AND m.estado_registro = 'aprobado'
        AND m.es_cuenta_test = false
    )
  );
