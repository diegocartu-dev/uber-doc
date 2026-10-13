-- 042 — espejo de `supabase/migrations/20261013_revocar_funciones_expuestas.sql`.

REVOKE EXECUTE ON FUNCTION public.entrar_sala_espera(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expirar_reservas_pendientes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entrar_sala_espera(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expirar_reservas_pendientes() TO service_role;
