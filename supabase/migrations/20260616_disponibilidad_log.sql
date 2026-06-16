-- Log de transiciones de disponibilidad para Consulta Inmediata (online/offline)
-- por médico. Alimenta el panel "Oferta por horario" (insights): permite calcular
-- las médico-horas de CI ofertadas por franja horaria (día × hora).
--
-- Cada fila es una transición: online=true (el médico se puso disponible),
-- online=false (se sacó). El cálculo de médico-horas empareja online→offline.
--
-- RLS ON sin policies → solo el service role (admin client) lee/escribe. El insert
-- se hace desde la server action del toggle vía createAdminClient (no desde el cliente).

CREATE TABLE IF NOT EXISTS disponibilidad_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id  uuid NOT NULL REFERENCES medicos(id),
  online     boolean NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disponibilidad_log_medico_at
  ON disponibilidad_log (medico_id, at);

ALTER TABLE disponibilidad_log ENABLE ROW LEVEL SECURITY;
