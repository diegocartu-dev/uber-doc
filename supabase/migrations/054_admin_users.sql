-- 054_admin_users.sql
-- Tabla de usuarios admin. Reemplaza el array hardcodeado ADMIN_EMAILS en src/lib/admin.ts.

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nivel TEXT NOT NULL CHECK (nivel IN ('super_admin', 'admin')),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_por UUID REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_login TIMESTAMPTZ,
  desactivado_en TIMESTAMPTZ,
  desactivado_por UUID REFERENCES auth.users(id),
  motivo_desactivacion TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_users_user_id_active
  ON public.admin_users(user_id) WHERE activo = true;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Solo admins activos pueden leer la tabla
CREATE POLICY admin_users_read ON public.admin_users
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid() AND au.activo = true
    )
  );

-- Sin politicas de INSERT/UPDATE/DELETE desde cliente.
-- Solo se modifica server-side con SERVICE_ROLE.

COMMENT ON TABLE public.admin_users IS 'Usuarios con acceso administrativo al panel /admin. Reemplaza el array hardcodeado en src/lib/admin.ts';
