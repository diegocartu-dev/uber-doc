-- Firma electrónica generalizada a `documentos` (L-2).
-- Aplicada en producción vía Supabase Management API el 2026-06-19.
-- Permite firmar certificado / indicaciones / orden con el MISMO motor cripto
-- que la receta (RSA-SHA256 + OTP + no-repudio), sin tocar el flujo de receta.
--
-- documentos.firma_digital: JSONB {hash, firma, algoritmo, firmado_at, medico_id, otp_id}.
-- firma_logs.documento_id: log de no-repudio puede referenciar un documento (no solo receta).
-- firma_logs.receta_id: pasa a NULLABLE (un log es de receta XOR de documento).
-- otp_firma.consumido_para_documento_id: one-time-use del OTP también para documentos.
ALTER TABLE documentos  ADD COLUMN IF NOT EXISTS firma_digital JSONB;
ALTER TABLE firma_logs  ADD COLUMN IF NOT EXISTS documento_id UUID REFERENCES documentos(id);
ALTER TABLE firma_logs  ALTER COLUMN receta_id DROP NOT NULL;
ALTER TABLE otp_firma   ADD COLUMN IF NOT EXISTS consumido_para_documento_id UUID REFERENCES documentos(id);
