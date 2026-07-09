-- REVOKE de RPCs legacy de turnos expuestas a cualquiera vía PostgREST (gate Roberto,
-- PR #256 — clasificado "explotable hoy"). Verificado en prod: ambas con EXECUTE para
-- PUBLIC/anon/authenticated.
--
-- 1) marcar_ausente_paciente() (migración 027, SECURITY DEFINER, SIN llamadores en el
--    código): marca ausente_paciente todo turno en_espera >15 min. Con la política
--    "ausente_paciente = el médico cobra" (08/07), un médico que no se presentó podría
--    anular el reembolso de su paciente con un POST anónimo antes de que el cron (20 min)
--    lo resuelva como ausente_medico.
-- 2) expirar_turno(uuid): backlog conocido (project_backlog_rpc_revoke).
--
-- service_role conserva EXECUTE (ningún flujo del server las llama hoy, pero no hace
-- falta romperlas para el admin).

REVOKE EXECUTE ON FUNCTION public.marcar_ausente_paciente() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expirar_turno(uuid) FROM PUBLIC, anon, authenticated;
