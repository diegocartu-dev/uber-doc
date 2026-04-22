-- Migration 053: Comisión Docto + timestamps de transición en consultas

-- 1. Comisión Docto guardada en el momento del pago
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS comision_docto_pct NUMERIC(5,2) DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS comision_docto_monto NUMERIC(10,2);

ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS comision_docto_pct NUMERIC(5,2) DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS comision_docto_monto NUMERIC(10,2);

-- 2. Timestamps de transición en consultas (aprobado por Elena)
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS aceptada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS en_curso_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completada_at TIMESTAMPTZ;
