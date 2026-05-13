-- Sprint MP Fase 2 — Migración principal
-- Columnas de pago marketplace, trigger mp_conectado, estado bloqueado_sin_cobro

-- 1. last_refresh_status en medicos_mp_accounts
ALTER TABLE medicos_mp_accounts
  ADD COLUMN IF NOT EXISTS last_refresh_status TEXT DEFAULT 'never'
    CHECK (last_refresh_status IN ('never','success','failed','revoked'));
COMMENT ON COLUMN medicos_mp_accounts.last_refresh_status
  IS 'Resultado del último intento de refresh del cron: never | success | failed | revoked';

-- 2. mp_conectado denormalizado en medicos (mantenido por trigger)
ALTER TABLE medicos
  ADD COLUMN IF NOT EXISTS mp_conectado BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN medicos.mp_conectado
  IS 'Caché derivado de medicos_mp_accounts.estado. NO modificar manualmente — mantenido por trigger trg_sync_mp_conectado.';

-- 3. Trigger de sincronización
CREATE OR REPLACE FUNCTION sync_medico_mp_conectado()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE medicos
  SET mp_conectado = (NEW.estado = 'activo' AND NEW.expires_at > now())
  WHERE id = NEW.medico_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_mp_conectado ON medicos_mp_accounts;
CREATE TRIGGER trg_sync_mp_conectado
  AFTER INSERT OR UPDATE OF estado, expires_at ON medicos_mp_accounts
  FOR EACH ROW
  EXECUTE FUNCTION sync_medico_mp_conectado();

-- 4. Backfill: sincronizar mp_conectado con el estado actual
UPDATE medicos m
SET mp_conectado = EXISTS (
  SELECT 1 FROM medicos_mp_accounts a
  WHERE a.medico_id = m.id
    AND a.estado = 'activo'
    AND a.expires_at > now()
);

-- 5. Índice parcial para queries públicos rápidos
CREATE INDEX IF NOT EXISTS idx_medicos_mp_conectado_true
  ON medicos (id) WHERE mp_conectado = true;

-- 6. Columnas de pago en consultas (no existían)
ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS pago_id TEXT,
  ADD COLUMN IF NOT EXISTS monto INTEGER,
  ADD COLUMN IF NOT EXISTS mp_status TEXT,
  ADD COLUMN IF NOT EXISTS mp_application_fee NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS mp_net_amount_medico NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS mp_payment_created_at TIMESTAMPTZ;

-- 7. Columnas de pago en turnos (reutiliza pago_id y monto existentes)
ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS mp_status TEXT,
  ADD COLUMN IF NOT EXISTS mp_application_fee NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS mp_net_amount_medico NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS mp_payment_created_at TIMESTAMPTZ;

-- 8. Nuevo estado bloqueado_sin_cobro en turnos (TEXT + CHECK, no ENUM)
-- TODO: 'ausente_medico' y 'reprogramado' están en el CHECK pero no se escriben
-- desde código. Activar cuando se implemente cancelación avanzada / reprogramación robusta.
ALTER TABLE turnos DROP CONSTRAINT IF EXISTS turnos_estado_check;
ALTER TABLE turnos ADD CONSTRAINT turnos_estado_check CHECK (estado IN (
  'disponible', 'reservado_pendiente', 'confirmado',
  'en_espera', 'en_curso', 'completado',
  'ausente_paciente', 'ausente_medico',
  'cancelado_paciente', 'cancelado_medico',
  'reprogramado', 'bloqueado', 'bloqueado_sin_cobro'
));

-- 9. Trigger DELETE safety net para mp_conectado
-- Política: medicos_mp_accounts nunca se borra en flujo normal.
-- Para desconectar se hace UPDATE estado='revocado'.
-- Este trigger es safety net para cleanups manuales o edge cases.
CREATE OR REPLACE FUNCTION sync_medico_mp_conectado_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE medicos SET mp_conectado = false WHERE id = OLD.medico_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_mp_conectado_delete ON medicos_mp_accounts;
CREATE TRIGGER trg_sync_mp_conectado_delete
  AFTER DELETE ON medicos_mp_accounts
  FOR EACH ROW
  EXECUTE FUNCTION sync_medico_mp_conectado_on_delete();

NOTIFY pgrst, 'reload schema';
