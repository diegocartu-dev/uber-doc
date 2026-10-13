-- 044 — espejo de `supabase/migrations/20261013_documentos_constancia_solo_servidor.sql`.

ALTER POLICY "Médicos insertan documentos" ON public.documentos
  WITH CHECK (
    medico_id = (SELECT medicos.id FROM medicos WHERE medicos.user_id = auth.uid())
    AND tipo IS DISTINCT FROM 'constancia'
  );

REVOKE EXECUTE ON FUNCTION public.documento_segun_profesion() FROM PUBLIC, anon, authenticated;
