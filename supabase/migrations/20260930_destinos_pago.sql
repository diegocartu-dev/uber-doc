-- =============================================================================
-- Destinos de pago — "¿a dónde te pagamos?"
-- Plan: docs/sprints/2026-09-29-plan-pagos-desde-docto.md (T1.1, Diego 30/09/2026)
--
-- Una fila por destino, con historia: la vigente es UNA por persona y rol (la
-- misma cuenta puede ser paciente y profesional: cada rol tiene su destino).
-- Va en tabla APARTE de `medicos` y `pacientes` a propósito: una columna
-- personal en `medicos` sin grant rompe la consulta entera, y con grant la
-- expone por la policy pública (CLAUDE.md, "Grants de columna").
--
-- Quién escribe: SOLO el servidor (service role). La persona lee lo suyo; el
-- admin lee todo. Nadie borra: el destino reemplazado queda con vigente=false
-- y la fila NUEVA apunta a él por `reemplaza_a` (la historia se camina hacia
-- atrás desde la vigente). Borrar el usuario de auth está frenado (RESTRICT):
-- a dónde se pagó es rastro de plata.
--
-- NO APLICAR sin OK de Diego. Aplicar vía Supabase Management API
-- (POST /v1/projects/irpupskopjahbqqvckue/database/query).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.destinos_pago (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  rol           TEXT NOT NULL CHECK (rol IN ('medico', 'paciente')),
  -- mp_email: el e-mail de la cuenta de Mercado Pago (sale de /users/me por OAuth).
  -- alias / cvu / cbu: lo declara la persona (paciente al primer pago).
  tipo          TEXT NOT NULL CHECK (tipo IN ('mp_email', 'alias', 'cvu', 'cbu')),
  valor         TEXT NOT NULL,
  origen        TEXT NOT NULL CHECK (origen IN ('oauth_mp', 'declarado', 'admin')),
  vigente       BOOLEAN NOT NULL DEFAULT true,
  -- Desde cuándo se puede pagar a este destino. Un cambio de destino declarado
  -- queda bloqueado 24 h: el panel de admin lo muestra como no transferible
  -- hasta entonces y el cambio se avisa por mail (T1.5: fácil de guardar,
  -- difícil de cambiar a escondidas).
  usable_desde  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Cuándo se confirmó: para oauth_mp, la última lectura de /users/me.
  verificado_en TIMESTAMPTZ,
  reemplaza_a   UUID REFERENCES public.destinos_pago(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una sola vigente por persona y rol.
CREATE UNIQUE INDEX IF NOT EXISTS destinos_pago_vigente_por_persona
  ON public.destinos_pago (user_id, rol) WHERE vigente;
CREATE INDEX IF NOT EXISTS destinos_pago_user_creado
  ON public.destinos_pago (user_id, created_at DESC);

ALTER TABLE public.destinos_pago ENABLE ROW LEVEL SECURITY;

-- La persona lee los suyos (vigente e historia).
DO $$ BEGIN
  CREATE POLICY "persona_lee_su_destino" ON public.destinos_pago
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- El admin lee todo (panel de reembolsos y de pagos).
DO $$ BEGIN
  CREATE POLICY "admin_lee_destinos_pago" ON public.destinos_pago
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND activo)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Solo el servidor escribe.
DO $$ BEGIN
  CREATE POLICY "service_role_destinos_pago" ON public.destinos_pago
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON public.destinos_pago FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.destinos_pago FROM authenticated;
GRANT SELECT ON public.destinos_pago TO authenticated;

COMMENT ON TABLE public.destinos_pago IS 'A dónde le paga Docto a cada persona (reintegros, honorarios). Una vigente por persona y rol; historia sin borrar (la fila nueva apunta a la reemplazada). Escribe solo el servidor.';
