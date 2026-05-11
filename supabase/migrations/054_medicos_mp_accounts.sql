-- Sprint MP Marketplace Fase 1
-- Tabla principal: medicos_mp_accounts (conexión OAuth MP por médico)
-- Tabla auxiliar: mp_oauth_state (CSRF anti-replay, TTL 10 min)

-- =============================================
-- TABLA 1: medicos_mp_accounts
-- =============================================

CREATE TABLE medicos_mp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES medicos(id) ON DELETE CASCADE,
  mp_user_id TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL,
  public_key TEXT,
  live_mode BOOLEAN NOT NULL DEFAULT true,
  conectado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_renovacion TIMESTAMPTZ,
  desconectado_en TIMESTAMPTZ,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','expirado','revocado','error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(medico_id),
  UNIQUE(mp_user_id)
);

CREATE INDEX idx_medicos_mp_accounts_medico ON medicos_mp_accounts(medico_id);
CREATE INDEX idx_medicos_mp_accounts_expira ON medicos_mp_accounts(expires_at) WHERE estado = 'activo';

ALTER TABLE medicos_mp_accounts ENABLE ROW LEVEL SECURITY;

-- Médico lee su propio registro
DO $$ BEGIN
  CREATE POLICY "medico_lee_su_mp" ON medicos_mp_accounts
    FOR SELECT USING (medico_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- service_role tiene acceso total (para endpoints OAuth)
DO $$ BEGIN
  CREATE POLICY "service_role_escribe_mp" ON medicos_mp_accounts
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin puede leer para soporte
DO $$ BEGIN
  CREATE POLICY "admin_lee_mp" ON medicos_mp_accounts
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN medicos_mp_accounts.access_token_encrypted IS 'Encriptado con AES-256 usando MP_TOKEN_ENCRYPTION_KEY';
COMMENT ON COLUMN medicos_mp_accounts.refresh_token_encrypted IS 'Encriptado con AES-256 usando MP_TOKEN_ENCRYPTION_KEY';

-- =============================================
-- TABLA 2: mp_oauth_state (CSRF anti-replay)
-- =============================================

CREATE TABLE mp_oauth_state (
  state TEXT PRIMARY KEY,
  medico_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes'
);

CREATE INDEX idx_mp_oauth_state_expira ON mp_oauth_state(expires_at);

ALTER TABLE mp_oauth_state ENABLE ROW LEVEL SECURITY;

-- Solo service_role puede leer/escribir (endpoints OAuth del servidor)
DO $$ BEGIN
  CREATE POLICY "service_role_mp_oauth_state" ON mp_oauth_state
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
