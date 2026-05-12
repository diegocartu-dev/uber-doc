-- Fix RLS policy medico_lee_su_mp
-- Bug: usaba medico_id = auth.uid() pero medico_id referencia medicos(id), no auth.users(id)
-- Patrón correcto: subquery via medicos.user_id = auth.uid()

DROP POLICY IF EXISTS "medico_lee_su_mp" ON medicos_mp_accounts;

CREATE POLICY "medico_lee_su_mp" ON medicos_mp_accounts
  FOR SELECT USING (
    medico_id = (SELECT id FROM public.medicos WHERE user_id = auth.uid())
  );
