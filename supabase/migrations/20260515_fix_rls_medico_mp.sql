-- Fix hallazgo Roberto: RLS policy medico_lee_su_mp comparaba
-- medico_id = auth.uid() pero medico_id es FK a medicos(id),
-- no a auth.users(id). Nunca matcheaba.

DROP POLICY IF EXISTS "medico_lee_su_mp" ON medicos_mp_accounts;

CREATE POLICY "medico_lee_su_mp" ON medicos_mp_accounts
  FOR SELECT USING (
    medico_id IN (SELECT id FROM public.medicos WHERE user_id = auth.uid())
  );

COMMENT ON POLICY "medico_lee_su_mp" ON medicos_mp_accounts IS
  'Fix: médico puede leer su propia cuenta MP via subquery medicos.user_id = auth.uid()';
