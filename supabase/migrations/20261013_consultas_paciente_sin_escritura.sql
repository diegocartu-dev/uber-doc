-- =============================================================================
-- La sesión del paciente ya no escribe `consultas` (13/10/2026).
--
-- Probado en producción, en una transacción que se deshizo y con cuentas de
-- prueba: con su propia sesión (la clave pública está en el navegador), un
-- paciente creaba por un INSERT directo una consulta que ya figuraba `pagada`,
-- con `mp_status = 'approved'`. La policy "Pacientes pueden crear consultas"
-- solo miraba que el paciente fuera el de la sesión y que el médico estuviera
-- disponible y en el mismo carril; no miraba el estado. El panel del médico la
-- mostraba lista para atender.
--
-- La policy de cancelación ("Pacientes pueden cancelar sus consultas en espera")
-- tampoco limitaba columnas, y la aplicación no la usa: el paciente cancela por
-- /api/consultas/cancelar-solicitud, con service role.
--
-- El único lugar de la aplicación que escribía con la sesión del paciente
-- (crearConsulta) pasó a service role con los mismos controles. Se aplica
-- DESPUÉS de que ese deploy esté en producción. Va también a la base
-- institucional (041).
-- =============================================================================

DROP POLICY IF EXISTS "Pacientes pueden crear consultas" ON public.consultas;
DROP POLICY IF EXISTS "Pacientes pueden cancelar sus consultas en espera" ON public.consultas;
