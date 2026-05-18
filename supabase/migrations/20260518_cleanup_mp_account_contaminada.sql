-- Cleanup: borrar fila contaminada en medicos_mp_accounts
-- La fila del médico test (mp_user_id=3393764322) tiene un token real
-- de la cuenta GREBA de Diego (user 28443305) con live_mode=false.
-- Esto ocurrió porque el OAuth callback no validaba live_mode vs entorno.
-- El fix ya está aplicado en el código (validación cruzada + rechazo).

DELETE FROM medicos_mp_accounts
WHERE mp_user_id = '3393764322'
  AND live_mode = false;
