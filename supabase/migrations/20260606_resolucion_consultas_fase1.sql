-- =============================================================================
-- Resolución de consultas — Fase 1 (rejoin)
-- Ref: docs/diseno-resolucion-consultas.md §3.1, §12 · DECISIONES_PRODUCTO_DOCTO.md §13
--
-- Fase 1 = SOLO rejoin: reloj de reconexión de 2 min server-authoritative +
-- presencia de video para auditoría. SIN estados terminales nuevos, SIN plata.
--
-- NO APLICAR sin OK de Diego. Aplicar vía Supabase Management API
-- (POST /v1/projects/irpupskopjahbqqvckue/database/query).
-- =============================================================================

-- 1) Reloj de rejoin (server-authoritative).
--    NULL = no hay corte pendiente. Se setea cuando el webhook detecta que el
--    room quedó incompleto sin que sea una finalización del médico; se limpia al
--    reconectar (participant_joined) o al resolver (cron / room_finished).
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS desconectado_at TIMESTAMPTZ;
ALTER TABLE turnos     ADD COLUMN IF NOT EXISTS desconectado_at TIMESTAMPTZ;

-- 2) Presencia de video: append-only, una fila por evento del webhook LiveKit.
--    Señal objetiva de "quién se conectó al room y cuándo". La usa el motor de
--    resolución de Fase 2; en Fase 1 es auditoría + base para el cálculo de
--    "room incompleto".
CREATE TABLE IF NOT EXISTS video_presencia (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name    TEXT NOT NULL,                                   -- "consulta-<id>" | "turno-<id>"
  tipo         TEXT NOT NULL CHECK (tipo IN ('consulta','turno')),
  recurso_id   UUID NOT NULL,                                   -- consulta_id | turno_id
  rol          TEXT NOT NULL CHECK (rol IN ('medico','paciente','desconocido')),
  identity     TEXT NOT NULL,                                   -- identity LiveKit ("medico-<id>" / "paciente-<uid>")
  evento       TEXT NOT NULL CHECK (evento IN ('joined','left')),
  ocurrido_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw          JSONB                                            -- payload crudo para auditoría
);

CREATE INDEX IF NOT EXISTS idx_video_presencia_recurso
  ON video_presencia (tipo, recurso_id, ocurrido_at);

-- RLS: solo el service role (webhook + crons usan admin client, que bypassa RLS).
-- Sin policies para authenticated => bloqueado por defecto.
ALTER TABLE video_presencia ENABLE ROW LEVEL SECURITY;
