-- Sprint Firma Electrónica — Ola 1
-- Infraestructura criptográfica para firma de recetas
-- Ley 25.506 (firma digital), Resolución 2214/2025

-- ─── Tabla de claves RSA por médico ──────────────────────────────────────────
-- Separada de medicos para RLS estricto: la clave privada encriptada
-- NUNCA se expone al cliente. Solo accesible via service role.

CREATE TABLE IF NOT EXISTS public.medico_claves (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id           UUID NOT NULL REFERENCES public.medicos(id) UNIQUE,
  clave_publica       TEXT NOT NULL,
  clave_privada_enc   TEXT NOT NULL,  -- AES-256-GCM con FIRMA_MASTER_KEY
  algoritmo           TEXT NOT NULL DEFAULT 'RSA-SHA256',
  key_size            INTEGER NOT NULL DEFAULT 2048,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotada_at           TIMESTAMPTZ
);

ALTER TABLE public.medico_claves ENABLE ROW LEVEL SECURITY;

-- Médico puede leer SOLO su clave pública (la privada encriptada NO se expone)
-- El SELECT devuelve la fila pero la clave_privada_enc solo se lee via service role
CREATE POLICY "Médico ve su clave pública"
  ON public.medico_claves FOR SELECT
  USING (
    medico_id IN (SELECT id FROM public.medicos WHERE user_id = auth.uid())
  );

-- Sin INSERT/UPDATE/DELETE para authenticated — solo service role genera claves

-- Column-level grant: authenticated solo ve columnas seguras, no clave_privada_enc
REVOKE ALL ON public.medico_claves FROM authenticated;
GRANT SELECT (id, medico_id, clave_publica, algoritmo, key_size, created_at, rotada_at)
  ON public.medico_claves TO authenticated;

-- ─── Tabla OTP para firma de recetas ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.otp_firma (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id           UUID NOT NULL REFERENCES public.medicos(id),
  hash_codigo         TEXT NOT NULL,
  expira_at           TIMESTAMPTZ NOT NULL,
  usado               BOOLEAN NOT NULL DEFAULT false,
  intentos            INTEGER NOT NULL DEFAULT 0,
  consulta_id         UUID REFERENCES public.consultas(id),
  turno_id            UUID REFERENCES public.turnos(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.otp_firma ENABLE ROW LEVEL SECURITY;

-- Sin policies para authenticated — solo service role maneja OTPs
-- Esto previene que un médico lea/modifique sus propios OTPs via cliente

CREATE INDEX idx_otp_firma_medico ON public.otp_firma(medico_id);
CREATE INDEX idx_otp_firma_expira ON public.otp_firma(expira_at);
