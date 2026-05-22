-- Fixes de auditoría final — Firma Electrónica
-- Hallazgos Roberto: C-3, C-4, I-1, I-3, I-5
-- Fecha: 22/05/2026

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX C-3 / 5.4 — Tabla firma_logs (no-repudio independiente)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Registro inmutable de cada acto de firma. Separado de recetas.firma_digital
-- para garantizar no-repudio ante terceros (farmacia, juez, organismo).
-- Política de retención: 10 años (Carolina).

CREATE TABLE IF NOT EXISTS public.firma_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receta_id           UUID NOT NULL REFERENCES public.recetas(id),
  medico_id           UUID NOT NULL REFERENCES public.medicos(id),
  hash                TEXT NOT NULL,
  algoritmo           TEXT NOT NULL DEFAULT 'RSA-SHA256',
  firmado_at          TIMESTAMPTZ NOT NULL,
  otp_id              UUID NOT NULL REFERENCES public.otp_firma(id),
  ip                  TEXT,
  user_agent          TEXT,
  clave_id            UUID REFERENCES public.medico_claves(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.firma_logs ENABLE ROW LEVEL SECURITY;

-- INSERT-only para service role. Sin SELECT/UPDATE/DELETE para authenticated.
-- Los logs son inmutables: ni el médico ni el admin pueden modificarlos vía API.

CREATE INDEX idx_firma_logs_receta ON public.firma_logs(receta_id);
CREATE INDEX idx_firma_logs_medico ON public.firma_logs(medico_id);
CREATE INDEX idx_firma_logs_fecha ON public.firma_logs(firmado_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX C-4 / 4.3 — Triggers anti-DELETE en tablas críticas
-- ═══════════════════════════════════════════════════════════════════════════════
-- Previene borrado de evidencia criptográfica incluso con service role.

CREATE OR REPLACE FUNCTION prevent_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'No se permite borrar registros de la tabla %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- Recetas: no se borran nunca
CREATE TRIGGER trg_no_delete_recetas
  BEFORE DELETE ON public.recetas
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- Claves de médico: historial criptográfico
CREATE TRIGGER trg_no_delete_medico_claves
  BEFORE DELETE ON public.medico_claves
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- OTPs: evidencia de 2FA
CREATE TRIGGER trg_no_delete_otp_firma
  BEFORE DELETE ON public.otp_firma
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- Logs de firma: evidencia de no-repudio
CREATE TRIGGER trg_no_delete_firma_logs
  BEFORE DELETE ON public.firma_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_delete();

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX I-1 — OTP consumido por firma (one-time-use)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Cada OTP solo puede firmar UNA receta. Campo consumido_para_receta_id
-- se llena atómicamente al firmar.

ALTER TABLE public.otp_firma
  ADD COLUMN IF NOT EXISTS consumido_para_receta_id UUID REFERENCES public.recetas(id),
  ADD COLUMN IF NOT EXISTS validado_at TIMESTAMPTZ;

-- Unique constraint: un OTP solo firma una receta
CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_firma_consumido_unico
  ON public.otp_firma(consumido_para_receta_id)
  WHERE consumido_para_receta_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX I-3 / 4.4 — Modelo activa/revocada para claves
-- ═══════════════════════════════════════════════════════════════════════════════
-- Las claves se pueden revocar pero NO borrar (trigger anti-DELETE).
-- Claves revocadas se mantienen para verificar firmas históricas.

ALTER TABLE public.medico_claves
  ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS revocada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_revocacion TEXT;

-- Índice parcial: solo una clave activa por médico
CREATE UNIQUE INDEX IF NOT EXISTS idx_medico_claves_activa_unica
  ON public.medico_claves(medico_id)
  WHERE activa = true;
