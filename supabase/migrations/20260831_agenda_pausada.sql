-- El profesional que dejó plantado un turno PAGO queda con la agenda
-- DESPUBLICADA hasta que él mismo la reactive (decisión Diego 31/08: "el que
-- hace esperar se le desactiva la oferta" — la CI ya se apagaba; esto extiende
-- la consecuencia a los turnos).
--
-- Es una BANDERA en el médico y no una mutación de slots a propósito: la agenda
-- se auto-reconcilia contra sus modelos (sincronizarTurnosConModelos desbloquea
-- lo que "debería estar disponible"), así que bloquear slots como sanción se
-- desharía solo en la próxima sincronización.
--
-- NULL = agenda normal. Con fecha = pausada desde ese momento; los slots
-- 'disponible' dejan de ofrecerse (clínica, página de turnos, menú de rescate,
-- y el guard server-side de reserva) pero NO se tocan: los turnos ya pagados
-- por otros pacientes siguen intactos y se atienden normal.
--
-- Sin GRANT SELECT para authenticated (como toda columna nueva de `medicos`):
-- se lee SIEMPRE con service role. Meterla en un SELECT con cliente RLS
-- rompería la query entera en silencio (outage 22/06).
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS agenda_pausada_at TIMESTAMPTZ;

COMMENT ON COLUMN medicos.agenda_pausada_at IS
  'Agenda despublicada por no-show de un turno pago (NULL = normal). La levanta el propio profesional desde su agenda. Los slots no se mutan: la ofertan/reservan las queries que miran esta bandera.';
