-- 20260623_revoke_notificaciones_grants.sql
-- Hardening (hallazgo QA Roberto, PR #208). La tabla `notificaciones_medico` heredó del
-- default grants amplios (SELECT/INSERT/UPDATE/DELETE/...) para los roles `anon` y
-- `authenticated`. Hoy es INOFENSIVO porque la tabla tiene RLS ENABLED sin policies
-- (fail-closed: un INSERT anónimo da 401). Pero como red de seguridad ante un futuro
-- `CREATE POLICY` accidental que abriría acceso, se revocan los grants explícitamente.
--
-- El acceso real a esta tabla es 100% server-side con service role (createAdminClient):
--   - /api/medico/notificaciones (GET/POST) — resuelve el médico de la sesión.
--   - /api/admin/notificaciones (POST) — envía, valida verificarAdmin.
-- El rol `service_role` NO se ve afectado por un REVOKE a `anon`/`authenticated`.

REVOKE ALL ON public.notificaciones_medico FROM anon, authenticated;
