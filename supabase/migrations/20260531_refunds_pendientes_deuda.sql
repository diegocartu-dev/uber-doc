-- Ola 3 ticket 3B: cola de reintentos de refund + deuda del médico
-- Cuando un refund no se completa (médico sin saldo, o fee de Docto falló),
-- se registra acá para que el cron reintentar-refunds lo reintente cada 24hs.
-- A las 48hs sin resolverse, se escala: se registra la deuda del médico y se
-- alerta al admin para cubrir al paciente por CVU manual (sección 2.2 política).

-- =============================================
-- TABLA 1: refunds_pendientes (cola de reintentos)
-- =============================================

CREATE TABLE refunds_pendientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('turno','consulta')),
  recurso_id UUID NOT NULL,
  medico_id UUID NOT NULL REFERENCES medicos(id) ON DELETE CASCADE,
  pago_id TEXT NOT NULL,
  neto_medico NUMERIC NOT NULL,
  application_fee NUMERIC NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','fee_pendiente','escalado','resuelto')),
  intentos INT NOT NULL DEFAULT 1,
  ultimo_error TEXT,
  ultimo_intento_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  proximo_intento_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resuelto_at TIMESTAMPTZ,
  UNIQUE (tipo, recurso_id)
);

CREATE INDEX idx_refunds_pendientes_proximo ON refunds_pendientes(proximo_intento_at)
  WHERE estado IN ('pendiente','fee_pendiente');

ALTER TABLE refunds_pendientes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_refunds_pendientes" ON refunds_pendientes
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_lee_refunds_pendientes" ON refunds_pendientes
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND activo)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- TABLA 2: medicos_deuda (Docto cubrió → médico debe)
-- =============================================

CREATE TABLE medicos_deuda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES medicos(id) ON DELETE CASCADE,
  monto NUMERIC NOT NULL,
  origen_tipo TEXT NOT NULL CHECK (origen_tipo IN ('turno','consulta')),
  origen_recurso_id UUID NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','recuperando','saldada')),
  monto_recuperado NUMERIC NOT NULL DEFAULT 0,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  saldada_at TIMESTAMPTZ,
  UNIQUE (origen_tipo, origen_recurso_id)
);

CREATE INDEX idx_medicos_deuda_medico ON medicos_deuda(medico_id) WHERE estado <> 'saldada';

ALTER TABLE medicos_deuda ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_medicos_deuda" ON medicos_deuda
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_lee_medicos_deuda" ON medicos_deuda
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND activo)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE refunds_pendientes IS 'Cola de reintentos de refund (Ola 3 / 3B). Procesada por cron/reintentar-refunds cada 24hs.';
COMMENT ON TABLE medicos_deuda IS 'Deuda del médico cuando Docto cubre un reembolso de su bolsillo (sección 3 política). Se recupera vía marketplace_fee (ticket 3C).';
