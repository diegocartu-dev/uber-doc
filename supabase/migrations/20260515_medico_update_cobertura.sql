-- Sprint Receta PR 1: permitir que médicos actualicen datos de cobertura
-- de pacientes con los que tienen una consulta activa (en_curso).
-- Solo campos de cobertura, NO datos identitarios (nombre, DNI, etc.)

CREATE POLICY "Medicos pueden actualizar cobertura de sus pacientes"
ON pacientes
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM consultas c
    JOIN medicos m ON m.id = c.medico_id
    WHERE c.paciente_id = pacientes.user_id
      AND m.user_id = auth.uid()
      AND c.estado = 'en_curso'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM consultas c
    JOIN medicos m ON m.id = c.medico_id
    WHERE c.paciente_id = pacientes.user_id
      AND m.user_id = auth.uid()
      AND c.estado = 'en_curso'
  )
);

-- Nota: esta policy permite UPDATE de cualquier columna de pacientes.
-- La restricción a solo columnas de cobertura se hace en el código
-- (el UPDATE solo envía tiene_cobertura, obra_social, nro_afiliado, plan_obra_social).
-- Si en el futuro se necesita restringir a nivel DB, usar column-level security
-- o una RPC con SECURITY DEFINER.

COMMENT ON POLICY "Medicos pueden actualizar cobertura de sus pacientes" ON pacientes IS
  'Sprint Receta PR 1: médico puede actualizar datos de cobertura del paciente durante consulta activa.';
