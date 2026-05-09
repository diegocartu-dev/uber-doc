-- 055_admin_audit_log.sql
-- Log inmutable de toda accion administrativa.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES public.admin_users(id),
  accion TEXT NOT NULL,
  recurso_tipo TEXT NOT NULL,
  recurso_id TEXT,
  ip_address INET,
  user_agent TEXT,
  desde_mobile BOOLEAN NOT NULL DEFAULT false,
  payload_anterior JSONB,
  payload_nuevo JSONB,
  motivo TEXT,
  metadata JSONB,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin_fecha
  ON public.admin_audit_log(admin_user_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_audit_recurso
  ON public.admin_audit_log(recurso_tipo, recurso_id);
CREATE INDEX IF NOT EXISTS idx_audit_accion
  ON public.admin_audit_log(accion);
CREATE INDEX IF NOT EXISTS idx_audit_fecha
  ON public.admin_audit_log(creado_en DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier admin activo puede leer
CREATE POLICY admin_audit_read ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid() AND activo = true
    )
  );

-- Sin politicas de INSERT/UPDATE/DELETE desde cliente.
-- Solo se inserta server-side con SUPABASE_SERVICE_ROLE_KEY.
-- Inmutable: nadie puede modificar ni borrar registros.

COMMENT ON TABLE public.admin_audit_log IS 'Log inmutable de toda accion administrativa. Insercion solo server-side.';
