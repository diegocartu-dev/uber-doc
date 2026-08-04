-- Firma del cierre de atenciones (caso Hugo 01/08): hora + origen en los 6
-- caminos que cierran consultas/turnos. Sin esto no hay duración de consulta
-- ni forma de distinguir un cierre real de uno automático.
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS cierre_origen text;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS cierre_origen text;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS completada_at timestamptz;
