-- =============================================================================
-- Dos funciones SECURITY DEFINER que cualquiera podía ejecutar (13/10/2026).
--
-- `entrar_sala_espera(uuid)` pasa CUALQUIER turno `confirmado` a `en_espera`
-- sin mirar de quién es, y `expirar_reservas_pendientes()` libera reservas sin
-- las guardas de `liberar-reservas` (pago vivo, `pago_id`). Las dos se podían
-- ejecutar con la clave pública, incluso sin sesión (`anon`). Con la primera,
-- un tercero podía hacer que el cron de turnos vencidos marcara a un
-- profesional como ausente y le devolviera la plata al paciente.
--
-- Nadie las llama: ni la aplicación ni una tarea programada de la base (no hay
-- pg_cron). Es el mismo cierre que `expirar_turno` y `marcar_ausente_paciente`
-- tuvieron el 08/07. Va también a la base institucional (042).
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.entrar_sala_espera(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expirar_reservas_pendientes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entrar_sala_espera(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expirar_reservas_pendientes() TO service_role;
