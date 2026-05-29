-- Migración: corregir tabla medico_paciente_perfil
-- Renombrar medico_id → medico_user_id (es auth.users.id, no medicos.id)
-- Agregar DELETE policy faltante
--
-- NOTA: medico_user_id referencia auth.users(id), NO medicos(id).
-- Esto permite RLS simple (medico_user_id = auth.uid()) sin cross-table
-- subqueries que causaron recursion infinita en el pasado.

-- 1. Renombrar columna
ALTER TABLE medico_paciente_perfil
  RENAME COLUMN medico_id TO medico_user_id;

-- 2. Dropear policies viejas (usan medico_id)
DROP POLICY IF EXISTS "medico_select_own_perfil" ON medico_paciente_perfil;
DROP POLICY IF EXISTS "medico_insert_own_perfil" ON medico_paciente_perfil;
DROP POLICY IF EXISTS "medico_update_own_perfil" ON medico_paciente_perfil;

-- 3. Recrear policies con medico_user_id + agregar DELETE

CREATE POLICY "medico_select_own_perfil"
  ON medico_paciente_perfil
  FOR SELECT
  TO authenticated
  USING (medico_user_id = auth.uid());

CREATE POLICY "medico_insert_own_perfil"
  ON medico_paciente_perfil
  FOR INSERT
  TO authenticated
  WITH CHECK (medico_user_id = auth.uid());

CREATE POLICY "medico_update_own_perfil"
  ON medico_paciente_perfil
  FOR UPDATE
  TO authenticated
  USING (medico_user_id = auth.uid())
  WITH CHECK (medico_user_id = auth.uid());

CREATE POLICY "medico_delete_own_perfil"
  ON medico_paciente_perfil
  FOR DELETE
  TO authenticated
  USING (medico_user_id = auth.uid());
