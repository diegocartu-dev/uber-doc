-- Migración: tabla medico_paciente_perfil (patología crónica por vínculo médico-paciente)
-- Sprint: Historia Clínica + Nova Evolución

CREATE TABLE IF NOT EXISTS medico_paciente_perfil (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  medico_id UUID NOT NULL REFERENCES auth.users(id),
  paciente_id UUID NOT NULL REFERENCES pacientes(id),
  patologia_cronica TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(medico_id, paciente_id)
);

-- RLS
ALTER TABLE medico_paciente_perfil ENABLE ROW LEVEL SECURITY;

-- SELECT: médico autenticado donde medico_id = auth.uid()
CREATE POLICY "medico_select_own_perfil"
  ON medico_paciente_perfil
  FOR SELECT
  TO authenticated
  USING (medico_id = auth.uid());

-- INSERT: médico autenticado donde medico_id = auth.uid()
CREATE POLICY "medico_insert_own_perfil"
  ON medico_paciente_perfil
  FOR INSERT
  TO authenticated
  WITH CHECK (medico_id = auth.uid());

-- UPDATE: médico autenticado donde medico_id = auth.uid()
CREATE POLICY "medico_update_own_perfil"
  ON medico_paciente_perfil
  FOR UPDATE
  TO authenticated
  USING (medico_id = auth.uid())
  WITH CHECK (medico_id = auth.uid());
