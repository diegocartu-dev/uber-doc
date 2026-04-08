-- ============================================
-- Migración: Consultorio Privado del Médico
-- ============================================

-- 1. Agregar slug a medicos (para URL /dr/[slug])
ALTER TABLE public.medicos
  ADD COLUMN slug text UNIQUE;

-- 2. Generar slugs para médicos existentes
-- Formato: nombre-apellido-TIPONUM (ej: diego-gonzalez-MN12345)
UPDATE public.medicos
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      -- Transliterate accented characters
      TRANSLATE(
        nombre_completo,
        'áéíóúÁÉÍÓÚñÑüÜ',
        'aeiouAEIOUnNuU'
      ),
      '[^a-zA-Z0-9\s]', '', 'g'  -- remove non-alphanumeric (except spaces)
    ),
    '\s+', '-', 'g'  -- spaces to hyphens
  )
) || '-' || tipo_matricula || numero_matricula;

-- Ahora que todos tienen slug, hacerlo NOT NULL
ALTER TABLE public.medicos
  ALTER COLUMN slug SET NOT NULL;

-- 3. Agregar canal_origen a consultas
ALTER TABLE public.consultas
  ADD COLUMN canal_origen text NOT NULL DEFAULT 'clinica_virtual'
  CHECK (canal_origen IN ('clinica_virtual', 'consultorio_privado'));

-- 4. Agregar canal_origen a turnos
ALTER TABLE public.turnos
  ADD COLUMN canal_origen text NOT NULL DEFAULT 'clinica_virtual'
  CHECK (canal_origen IN ('clinica_virtual', 'consultorio_privado'));

-- 5. Index para búsqueda por slug
CREATE INDEX idx_medicos_slug ON public.medicos (slug);
