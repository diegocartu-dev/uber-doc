-- 056_feature_flags.sql
-- Flags globales para encender/apagar funcionalidades sin deploy.

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  es_kill_switch BOOLEAN NOT NULL DEFAULT false,
  ultima_modificacion TIMESTAMPTZ,
  ultima_modificacion_por UUID REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON public.feature_flags(key);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier sesion autenticada puede leer (las features consultan en runtime)
CREATE POLICY feature_flags_read ON public.feature_flags
  FOR SELECT TO authenticated
  USING (true);

-- Modificacion: solo server-side con SERVICE_ROLE.

-- SEED: 9 flags definidos en el documento de producto v1.2
INSERT INTO public.feature_flags (key, nombre, descripcion, activo, es_kill_switch) VALUES
  ('consulta_inmediata_global', 'Consulta Inmediata',
   'Apaga la CI para toda la plataforma. Pacientes nuevos no pueden iniciar CI. Las CI en curso no se ven afectadas.',
   true, true),
  ('turnos_global', 'Turnos Programados',
   'Apaga el flujo de turnos programados. No se pueden reservar nuevos turnos. Los turnos confirmados no se ven afectados.',
   true, false),
  ('registro_pacientes_publico', 'Registro de Pacientes',
   'Bloquea el registro publico de nuevos pacientes en /auth/register.',
   true, true),
  ('registro_medicos_publico', 'Registro de Medicos',
   'Bloquea el registro publico de nuevos medicos en /auth/registro-medico.',
   true, true),
  ('nova_ai', 'Nova (asistente IA)',
   'Apaga el asistente Nova en dashboards de medicos. Util si Nova responde mal.',
   true, true),
  ('pago_mercado_pago', 'Pago via Mercado Pago',
   'Apaga el cobro via MP. Los pacientes nuevos no pueden completar reservas. Modo demo activo.',
   true, true),
  ('web_push', 'Notificaciones Web Push',
   'Apaga el envio de push notifications a medicos y pacientes.',
   true, true),
  ('email_transaccional', 'Emails transaccionales (Resend)',
   'Apaga el envio de emails transaccionales. Modo silencioso. No afecta al envio de magic links de Auth.',
   true, true),
  ('consultorio_particular', 'Consultorio Particular',
   'Apaga el flujo de Consultorio Particular (/dr/[slug]). No afecta a Clinica Virtual ni CI.',
   true, false)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.feature_flags IS 'Flags globales para encender/apagar funcionalidades sin deploy. Lectura desde cualquier autenticado, escritura solo server-side.';
