-- Sprint MP Fase 2 — ROLLBACK
-- Revierte cada operación de 20260512_mp_fase2.sql en orden inverso.
-- Correr SOLO si algo sale mal post-migración.

-- 9. Quitar trigger DELETE safety net
DROP TRIGGER IF EXISTS trg_sync_mp_conectado_delete ON medicos_mp_accounts;
DROP FUNCTION IF EXISTS sync_medico_mp_conectado_on_delete();

-- 8. Restaurar CHECK constraint de turnos.estado SIN bloqueado_sin_cobro
ALTER TABLE turnos DROP CONSTRAINT IF EXISTS turnos_estado_check;
ALTER TABLE turnos ADD CONSTRAINT turnos_estado_check CHECK (estado IN (
  'disponible', 'reservado_pendiente', 'confirmado',
  'en_espera', 'en_curso', 'completado',
  'ausente_paciente', 'ausente_medico',
  'cancelado_paciente', 'cancelado_medico',
  'reprogramado', 'bloqueado'
));

-- 7. Quitar columnas mp_* de turnos
ALTER TABLE turnos
  DROP COLUMN IF EXISTS mp_status,
  DROP COLUMN IF EXISTS mp_application_fee,
  DROP COLUMN IF EXISTS mp_net_amount_medico,
  DROP COLUMN IF EXISTS mp_payment_created_at;

-- 6. Quitar columnas de pago de consultas
ALTER TABLE consultas
  DROP COLUMN IF EXISTS pago_id,
  DROP COLUMN IF EXISTS monto,
  DROP COLUMN IF EXISTS mp_status,
  DROP COLUMN IF EXISTS mp_application_fee,
  DROP COLUMN IF EXISTS mp_net_amount_medico,
  DROP COLUMN IF EXISTS mp_payment_created_at;

-- 5. Quitar índice parcial
DROP INDEX IF EXISTS idx_medicos_mp_conectado_true;

-- 4. Backfill no necesita rollback (columna se dropea en paso 2)

-- 3. Quitar trigger y función
DROP TRIGGER IF EXISTS trg_sync_mp_conectado ON medicos_mp_accounts;
DROP FUNCTION IF EXISTS sync_medico_mp_conectado();

-- 2. Quitar mp_conectado de medicos
ALTER TABLE medicos
  DROP COLUMN IF EXISTS mp_conectado;

-- 1. Quitar last_refresh_status de medicos_mp_accounts
ALTER TABLE medicos_mp_accounts
  DROP COLUMN IF EXISTS last_refresh_status;

NOTIFY pgrst, 'reload schema';
