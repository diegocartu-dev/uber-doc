-- Watchdog de crons ("dead man's switch") — auditoría fallas silenciosas 13/07/2026.
-- Cada cron registra su corrida acá; el cron guardián (/api/cron/watchdog) alerta
-- por mail si alguno falla o DEJÓ de correr (lo que hoy es 100% invisible).
CREATE TABLE IF NOT EXISTS public.cron_runs (
  cron_key        TEXT PRIMARY KEY,
  last_run_at     TIMESTAMPTZ,
  last_ok_at      TIMESTAMPTZ,
  last_status     TEXT,          -- 'ok' | 'error'
  last_error      TEXT,
  last_alerted_at TIMESTAMPTZ,   -- anti-spam: no re-alertar el mismo cron por 6 h
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo el service role (los crons) lee/escribe. authenticated/anon: nada.

-- Hardening (gate Roberto #260 O1): los default privileges de Supabase dan ALL a
-- anon/authenticated a nivel grant; hoy RLS deny-all bloquea en la práctica, pero
-- si mañana alguien deshabilita RLS o agrega una policy permisiva, la tabla queda
-- abierta. Defensa en profundidad: sin grants, punto.
REVOKE ALL ON public.cron_runs FROM anon, authenticated;
