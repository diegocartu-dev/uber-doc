-- Migration 051: Admin panel support
-- Adds patient account state columns and alertas_admin table

-- 1. Pacientes: estado de cuenta para pausar/bloquear
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS estado_cuenta TEXT DEFAULT 'activo'
    CHECK (estado_cuenta IN ('activo', 'pausado', 'bloqueado')),
  ADD COLUMN IF NOT EXISTS motivo_estado TEXT,
  ADD COLUMN IF NOT EXISTS estado_hasta TIMESTAMPTZ;

-- 2. Medicos: notas admin para registrar motivos de rechazo/suspensión
ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS notas_admin TEXT;

-- 3. Tabla de alertas del admin
CREATE TABLE IF NOT EXISTS public.alertas_admin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  entidad_tipo TEXT CHECK (entidad_tipo IN ('medico', 'paciente', 'consulta', 'sistema')),
  entidad_id UUID,
  severidad TEXT DEFAULT 'media' CHECK (severidad IN ('baja', 'media', 'alta', 'critica')),
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'resuelta', 'ignorada')),
  resuelta_por TEXT,
  resuelta_at TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Solo accesible via service_role (admin client)
ALTER TABLE public.alertas_admin ENABLE ROW LEVEL SECURITY;
