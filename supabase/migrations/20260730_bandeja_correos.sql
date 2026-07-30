-- Bandeja de correo del panel admin (spec Diego 30/07, replicada de Validdar).
-- Tabla única para entrada y salida; solo el server la toca (service role):
-- RLS activado SIN políticas.

CREATE TABLE IF NOT EXISTS correos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  direccion text NOT NULL CHECK (direccion IN ('entrada', 'salida')),
  de text,
  para text,
  asunto text,
  cuerpo_texto text,
  cuerpo_html text,
  adjuntos jsonb,
  leido boolean NOT NULL DEFAULT false,
  atendido boolean NOT NULL DEFAULT false,
  en_respuesta_a uuid REFERENCES correos(id),
  resend_id text,
  enviado_por uuid,
  error_envio text
);

ALTER TABLE correos ENABLE ROW LEVEL SECURITY;

-- Idempotencia ante reintentos del webhook de Resend.
CREATE UNIQUE INDEX IF NOT EXISTS correos_resend_id_unico
  ON correos (resend_id) WHERE resend_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS correos_bandeja_idx
  ON correos (direccion, creado_en DESC);
