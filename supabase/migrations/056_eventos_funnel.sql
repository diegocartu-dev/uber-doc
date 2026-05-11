CREATE TABLE eventos_funnel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento TEXT NOT NULL CHECK (evento IN (
    'mp_oauth_view_tab',
    'mp_oauth_start_click',
    'mp_oauth_callback_success',
    'mp_oauth_callback_error',
    'mp_oauth_disconnect'
  )),
  medico_id UUID REFERENCES medicos(id) ON DELETE SET NULL,
  paciente_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eventos_funnel_evento ON eventos_funnel(evento);
CREATE INDEX idx_eventos_funnel_created ON eventos_funnel(created_at);
CREATE INDEX idx_eventos_funnel_medico ON eventos_funnel(medico_id);

ALTER TABLE eventos_funnel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_eventos_funnel" ON eventos_funnel
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "admin_lee_eventos" ON eventos_funnel
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

COMMENT ON TABLE eventos_funnel IS 'Eventos de funnel de conversión. La whitelist en CHECK debe ampliarse vía migración nueva cuando se agregan eventos.';
COMMENT ON COLUMN eventos_funnel.evento IS 'Tipo de evento. Sigue convención snake_case con prefijo del feature (ej: mp_oauth_*, consulta_*, turno_*).';
COMMENT ON COLUMN eventos_funnel.metadata IS 'JSONB libre con context no sensible. NUNCA tokens, secrets, IPs, PII.';
