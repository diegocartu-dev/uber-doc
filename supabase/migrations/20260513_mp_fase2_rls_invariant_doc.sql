-- Documenta invariante critico de RLS para medicos_mp_accounts
-- Sin este invariante, el trigger trg_sync_mp_conectado puede ser
-- vector de escalacion de privilegios.

COMMENT ON TABLE medicos_mp_accounts IS
'INVARIANTE DE SEGURIDAD CRITICO: esta tabla DEBE mantener RLS estricto.

El trigger trg_sync_mp_conectado usa SECURITY DEFINER para sincronizar
medicos.mp_conectado cuando cambia medicos_mp_accounts.estado o expires_at.
Esto bypasea RLS de medicos por diseno (UPDATE sobre denormalizacion).

Riesgo si se afloja RLS de esta tabla:
Si un usuario malicioso obtiene INSERT/UPDATE sobre medicos_mp_accounts
(por ejemplo, RLS abierta a authenticated en lugar de service_role),
puede modificar el estado de cuentas MP de OTROS medicos y disparar el
trigger para cambiar mp_conectado de cualquier medico.

REGLA: cualquier modificacion a las politicas RLS de medicos_mp_accounts
debe ser auditada por Roberto considerando esta dependencia.';

COMMENT ON FUNCTION sync_medico_mp_conectado() IS
'Trigger function con SECURITY DEFINER. Bypasea RLS de medicos.
Solo es seguro porque medicos_mp_accounts tiene RLS estricta.
Ver COMMENT en medicos_mp_accounts.';
