-- Sprint Compliance Bus — Fase 1, Item 1
-- Tabla de recetas electrónicas con trazabilidad para Bus de Interoperabilidad
-- Resolución 2214/2025, Disposición 1/2025 DNSISa

-- Enum estado de receta
DO $$ BEGIN
  CREATE TYPE receta_estado AS ENUM ('borrador', 'emitida', 'dispensada', 'anulada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum tipo de receta
DO $$ BEGIN
  CREATE TYPE receta_tipo AS ENUM ('comun', 'controlada', 'psicotropico');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.recetas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id           UUID NOT NULL REFERENCES public.medicos(id),
  paciente_id         UUID NOT NULL REFERENCES auth.users(id),
  consulta_id         UUID REFERENCES public.consultas(id),
  turno_id            UUID REFERENCES public.turnos(id),

  -- CUIR: lo genera el Repositorio DNSISa, nullable hasta integración
  cuir                TEXT,

  estado              receta_estado NOT NULL DEFAULT 'borrador',
  tipo_receta         receta_tipo NOT NULL DEFAULT 'comun',

  -- Datos de prescripción completos (medicamentos, diagnóstico, indicaciones)
  datos_prescripcion  JSONB NOT NULL DEFAULT '{}',

  -- Integridad y firma
  hash_pdf            TEXT,
  firma_digital       JSONB,

  -- Identificador de plataforma (Docto = 0270)
  plataforma_id       TEXT NOT NULL DEFAULT '0270',

  -- Temporalidad
  fecha_emision       TIMESTAMPTZ,
  fecha_vencimiento   TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT receta_requiere_consulta_o_turno
    CHECK (
      (consulta_id IS NOT NULL AND turno_id IS NULL)
      OR (consulta_id IS NULL AND turno_id IS NOT NULL)
    )
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.recetas ENABLE ROW LEVEL SECURITY;

-- Médico ve solo sus recetas
CREATE POLICY "Médico ve sus recetas"
  ON public.recetas FOR SELECT
  USING (
    medico_id IN (
      SELECT id FROM public.medicos WHERE user_id = auth.uid()
    )
  );

-- Paciente ve solo sus recetas
CREATE POLICY "Paciente ve sus recetas"
  ON public.recetas FOR SELECT
  USING (paciente_id = auth.uid());

-- Solo médicos pueden insertar recetas (y solo las propias)
CREATE POLICY "Médico inserta recetas"
  ON public.recetas FOR INSERT
  WITH CHECK (
    medico_id IN (
      SELECT id FROM public.medicos WHERE user_id = auth.uid()
    )
  );

-- Médico puede actualizar sus recetas (estado, hash, firma)
-- WITH CHECK impide transferir receta a otro médico
CREATE POLICY "Médico actualiza sus recetas"
  ON public.recetas FOR UPDATE
  USING (
    medico_id IN (
      SELECT id FROM public.medicos WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    medico_id IN (
      SELECT id FROM public.medicos WHERE user_id = auth.uid()
    )
  );

-- Nadie borra recetas — inmutabilidad para trazabilidad
-- Admin accede vía service role key

-- ─── Índices ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_recetas_medico ON public.recetas(medico_id);
CREATE INDEX idx_recetas_paciente ON public.recetas(paciente_id);
CREATE INDEX idx_recetas_consulta ON public.recetas(consulta_id);
CREATE INDEX idx_recetas_turno ON public.recetas(turno_id);
CREATE INDEX idx_recetas_estado ON public.recetas(estado);

-- CUIR es único cuando existe (el unique index también sirve para búsquedas)
CREATE UNIQUE INDEX uq_recetas_cuir ON public.recetas(cuir) WHERE cuir IS NOT NULL;

-- ─── Trigger updated_at ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_recetas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recetas_updated_at
  BEFORE UPDATE ON public.recetas
  FOR EACH ROW
  EXECUTE FUNCTION update_recetas_updated_at();
