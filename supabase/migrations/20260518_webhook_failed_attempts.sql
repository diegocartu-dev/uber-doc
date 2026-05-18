-- Rate limiting para firmas HMAC inválidas en webhook de MP
-- Sprint A: Bloqueantes MP Producción

CREATE TABLE IF NOT EXISTS webhook_failed_attempts (
  ip TEXT PRIMARY KEY,
  attempts_count INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_failed_first_attempt
  ON webhook_failed_attempts(first_attempt_at);

ALTER TABLE webhook_failed_attempts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_webhook_failed_attempts"
    ON webhook_failed_attempts
    FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
