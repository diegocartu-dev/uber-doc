-- PENDIENTE DE APLICAR — requiere OK de Diego. Solo en la base principal.
--
-- A las cuentas de prueba no se les manda WhatsApp (06/10/2026): los pacientes
-- de prueba tienen teléfonos que no son del equipo y la prueba de punta a punta
-- corre contra producción. El intento queda registrado con resultado
-- "cuenta_test", que hay que sumar a los valores permitidos. Nombre de la
-- restricción leído de pg_constraint, no supuesto.
ALTER TABLE public.whatsapp_envios DROP CONSTRAINT whatsapp_envios_resultado_check;
ALTER TABLE public.whatsapp_envios ADD CONSTRAINT whatsapp_envios_resultado_check
  CHECK (resultado = ANY (ARRAY['enviado', 'sin_celular', 'flag_apagado', 'sin_credenciales', 'error_twilio', 'throttled', 'cuenta_test']));
