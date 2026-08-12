-- 005_disponibilidad_eventos.sql — Historia del toggle de CI del profesional.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
--
-- Hoy no queda historia: disponible_desde_at se nullea al apagar el toggle
-- (src/app/dashboard/actions.ts). El trigger vive en la DB de la instancia =
-- cero cambio al código clonado (respeta la regla de clonado).
-- Telemetría opcional (el "activa desde las…" del otorgador); tras la regla
-- híbrida del acuerdo (12/08) NO es insumo del cómputo de horas.

CREATE TABLE disponibilidad_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id uuid NOT NULL,
  disponible boolean NOT NULL,
  ocurrido_at timestamptz NOT NULL DEFAULT now(),
  origen text
);

CREATE INDEX idx_disponibilidad_eventos_medico
  ON disponibilidad_eventos (medico_id, ocurrido_at);

-- SECURITY DEFINER: el trigger también dispara si un UPDATE sobre `medicos`
-- llega por el cliente RLS (no solo por service role); sin definer, el INSERT
-- chocaría contra el RLS-sin-policies de la tabla de eventos y tiraría abajo
-- el UPDATE original — o sea, rompería código clonado del B2C.
CREATE OR REPLACE FUNCTION log_disponibilidad() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.disponible IS DISTINCT FROM OLD.disponible THEN
    INSERT INTO disponibilidad_eventos (medico_id, disponible) VALUES (NEW.id, NEW.disponible);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_disponibilidad AFTER UPDATE ON medicos
  FOR EACH ROW EXECUTE FUNCTION log_disponibilidad();

-- RLS activo SIN policies: solo service role (append-only vía trigger).
ALTER TABLE disponibilidad_eventos ENABLE ROW LEVEL SECURITY;
