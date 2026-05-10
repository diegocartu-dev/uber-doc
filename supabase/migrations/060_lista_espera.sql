-- 060_lista_espera.sql
-- Captura de prospectos cuando el registro publico esta cerrado.

CREATE TABLE IF NOT EXISTS public.lista_espera (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('medico', 'paciente')),
  nombre TEXT,
  provincia TEXT,
  especialidad TEXT,
  matricula TEXT,
  notas TEXT,
  ip_address INET,
  user_agent TEXT,
  notificado_apertura BOOLEAN NOT NULL DEFAULT false,
  notificado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lista_espera_email_tipo
  ON public.lista_espera(email, tipo);
CREATE INDEX IF NOT EXISTS idx_lista_espera_tipo
  ON public.lista_espera(tipo);
CREATE INDEX IF NOT EXISTS idx_lista_espera_fecha
  ON public.lista_espera(creado_en DESC);

ALTER TABLE public.lista_espera ENABLE ROW LEVEL SECURITY;

-- Lectura: solo admins activos
CREATE POLICY lista_espera_admin_read ON public.lista_espera
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid() AND activo = true
    )
  );

-- Insert: publico (captura desde pantalla de registro cerrado)
CREATE POLICY lista_espera_public_insert ON public.lista_espera
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

COMMENT ON TABLE public.lista_espera IS 'Prospectos que se suscribieron durante beta cerrada.';
