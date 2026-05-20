-- Sprint Legal Item 1: Tabla de consentimientos informados por consulta
-- Ley 27.553 art. 7, Ley 26.529 art. 5-6

CREATE TABLE IF NOT EXISTS public.consentimientos_informados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id     UUID NOT NULL REFERENCES auth.users(id),
  consulta_id     UUID REFERENCES public.consultas(id),
  turno_id        UUID REFERENCES public.turnos(id),
  texto_version   TEXT NOT NULL DEFAULT 'v1',
  aceptado_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip              INET,
  user_agent      TEXT,

  CONSTRAINT ci_requiere_consulta_o_turno
    CHECK (consulta_id IS NOT NULL OR turno_id IS NOT NULL)
);

ALTER TABLE public.consentimientos_informados ENABLE ROW LEVEL SECURITY;

-- Pacientes solo ven sus propios consentimientos
CREATE POLICY "Pacientes ven sus consentimientos"
  ON public.consentimientos_informados
  FOR SELECT
  USING (auth.uid() = paciente_id);

-- Pacientes pueden insertar su propio consentimiento
CREATE POLICY "Pacientes registran consentimiento"
  ON public.consentimientos_informados
  FOR INSERT
  WITH CHECK (auth.uid() = paciente_id);

-- Consentimientos son inmutables — no se pueden updatear ni borrar por paciente
-- Admin puede leer vía service role key

CREATE INDEX idx_ci_paciente ON public.consentimientos_informados(paciente_id);
CREATE INDEX idx_ci_consulta ON public.consentimientos_informados(consulta_id);
CREATE INDEX idx_ci_turno ON public.consentimientos_informados(turno_id);

-- Un solo consentimiento por paciente+consulta+versión
CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_consulta
  ON public.consentimientos_informados(paciente_id, consulta_id, texto_version)
  WHERE consulta_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_turno
  ON public.consentimientos_informados(paciente_id, turno_id, texto_version)
  WHERE turno_id IS NOT NULL;
