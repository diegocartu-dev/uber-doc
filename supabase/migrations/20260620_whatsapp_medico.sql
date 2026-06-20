-- 20260620_whatsapp_medico.sql
-- Activación del aviso al médico por WhatsApp (Twilio). Dos piezas:
--   1) El feature flag `whatsapp_medico` (APAGADO por default → fail-closed). El código
--      (src/lib/whatsapp.ts) ya lo consulta vía getFlag; sin esta fila getFlag devuelve
--      false y el envío es no-op siempre. Se prende desde el panel admin.
--   2) Columna de throttle: evita reenviar "paciente esperando" al mismo médico dentro
--      de una ventana (30 min), cubriendo el cron (cada 10 min) y los re-render de la
--      página de sala.

INSERT INTO public.feature_flags (key, nombre, descripcion, activo, es_kill_switch) VALUES
  ('whatsapp_medico', 'Aviso al médico por WhatsApp',
   'Envía avisos al médico por WhatsApp (Twilio) cuando un paciente solicita una Consulta Inmediata (debe aceptarla) o cuando hay pacientes esperando en sala (CI, turno o consultorio particular). Canal de respaldo del Web Push. Inerte sin credenciales Twilio.',
   false, false)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS ultimo_whatsapp_espera_at TIMESTAMPTZ;

COMMENT ON COLUMN public.medicos.ultimo_whatsapp_espera_at IS
  'Último WhatsApp de "paciente esperando" enviado a este médico. Throttle anti-spam (30 min) del aviso por WhatsApp.';
