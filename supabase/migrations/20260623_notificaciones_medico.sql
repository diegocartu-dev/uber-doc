-- 20260623_notificaciones_medico.sql
-- Canal unidireccional admin → médico (campanita en el menú del médico).
-- Decisión Diego (23/06/2026): un canal in-app para avisarle a uno, a un segmento
-- (ej: no validados) o a TODOS los inscriptos — sin importar el estado del registro
-- (pendiente / aprobado / rechazado / suspendido) ni si validó identidad. Reemplaza
-- tener que mandar mails sueltos para cosas como "validá tu identidad" o "necesitás MN".
-- Unidireccional: el médico solo lee y marca leída; NO responde.

CREATE TABLE IF NOT EXISTS notificaciones_medico (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id   uuid NOT NULL REFERENCES medicos(id) ON DELETE CASCADE,
  titulo      text NOT NULL,
  mensaje     text NOT NULL,
  leida       boolean NOT NULL DEFAULT false,
  leida_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  enviada_por uuid  -- user_id del admin que la envió (auditoría)
);

-- Índice para el conteo de no-leídas por médico (la query más frecuente: la campanita).
CREATE INDEX IF NOT EXISTS idx_notif_medico_no_leidas
  ON notificaciones_medico (medico_id, leida);

-- RLS activo. Todo el acceso pasa por las APIs server-side con service role
-- (createAdminClient): el GET/mark-read del médico resuelve su medico_id desde la
-- sesión, y el envío del admin valida verificarAdmin. Sin policies públicas =
-- la tabla queda cerrada al cliente directo (fail-closed).
ALTER TABLE notificaciones_medico ENABLE ROW LEVEL SECURITY;
