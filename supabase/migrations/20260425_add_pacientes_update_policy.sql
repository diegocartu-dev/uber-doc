-- Fix: pacientes no podían actualizar su perfil en onboarding
-- El upsert con onConflict:"user_id" requiere UPDATE además de INSERT
CREATE POLICY "Pacientes pueden actualizar su propio registro"
ON public.pacientes FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
