-- 033 — espejo de `supabase/migrations/20261012_turnos_recordatorio_10m.sql`.
--
-- `turnos` es tabla COMPARTIDA y `vercel.json` es uno solo: el cron
-- `recordatorios-10min` se invoca también en este deploy. Acá corta en la
-- primera línea (Capa C: en la instancia los avisos al paciente los manda la
-- institución, no un mail de Docto con links al B2C), pero la columna se espeja
-- igual, por la regla de este README: si mañana alguien saca el corte, la query
-- no tira 500 cada minuto.
--
-- Reentrante. Aplicada en la base de la instancia el 12/10/2026.

ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS recordatorio_10m_at TIMESTAMPTZ;

COMMENT ON COLUMN public.turnos.recordatorio_10m_at IS
  'Cuándo el cron recordatorios-10min procesó el turno (mandó el aviso, o el paciente no lo había pedido). NO prueba que el aviso llegó. NULL = no se procesó.';
