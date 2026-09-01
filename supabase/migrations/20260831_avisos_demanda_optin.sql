-- Piloto "despertar oferta dormida" (Diego 31/08, guardrails de Tomás). El
-- diagnóstico de junio sigue vivo: la demanda se pierde sobre todo porque hay
-- médicos que EXISTEN y están apagados. Este aviso les dice "hay un paciente
-- buscando en tu provincia AHORA" — en el momento exacto de la demanda.
--
-- OPT-IN EXPLÍCITO, default false: nadie recibe este aviso sin haberlo pedido.
-- El canal ya quemó a una profesional (17 avisos en una madrugada, caso 18/08)
-- y el lado escaso no se quema dos veces. El alta del opt-in la gestiona Diego
-- persona a persona por ahora (no hay UI de toggle en V1, a propósito: el
-- opt-in ES la conversación con el profesional).
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS avisos_demanda_optin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN medicos.avisos_demanda_optin IS
  'Piloto despertar-oferta: aceptó recibir "hay un paciente buscando en tu provincia". Default false; lo activa Diego con el OK del profesional. Guardrails en /api/despertar-oferta.';
