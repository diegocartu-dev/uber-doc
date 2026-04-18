-- Agrega campos de perfil médico al paciente para completar recetas.
-- El paciente llena estos datos una vez antes de su primera consulta.
-- El médico no escribe en esta tabla: solo lectura via policy existente.

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
  ADD COLUMN IF NOT EXISTS sexo_dni TEXT CHECK (sexo_dni IN ('masculino', 'femenino')),
  ADD COLUMN IF NOT EXISTS tiene_cobertura BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS obra_social TEXT,
  ADD COLUMN IF NOT EXISTS nro_afiliado TEXT,
  ADD COLUMN IF NOT EXISTS perfil_medico_completado BOOLEAN DEFAULT false;

-- Las policies de UPDATE existentes (002_create_pacientes.sql) cubren estos campos
-- porque operan sobre toda la fila con USING (auth.uid() = user_id).
-- No se necesita política adicional: cualquier UPDATE del paciente autenticado
-- sobre su propio registro ya está permitido.

-- Verificación: la policy "Pacientes pueden actualizar su perfil" en 002_create_pacientes.sql
-- tiene USING (auth.uid() = user_id) sin WITH CHECK restrictivo de columnas,
-- por lo tanto cubre los nuevos campos automáticamente.
