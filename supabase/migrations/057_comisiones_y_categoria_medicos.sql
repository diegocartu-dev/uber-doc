-- 057_comisiones_y_categoria_medicos.sql
-- Tabla de configuracion global de comisiones + columna categoria en medicos.

-- Tabla de comisiones por categoria
CREATE TABLE IF NOT EXISTS public.comisiones_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria TEXT NOT NULL UNIQUE CHECK (categoria IN ('founder', 'tradicional')),
  porcentaje NUMERIC(5, 2) NOT NULL CHECK (porcentaje >= 0 AND porcentaje <= 100),
  ultima_modificacion TIMESTAMPTZ,
  ultima_modificacion_por UUID REFERENCES auth.users(id),
  motivo_ultimo_cambio TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Regimen actual: que categoria reciben los nuevos medicos al aprobarse
CREATE TABLE IF NOT EXISTS public.regimen_nuevos_medicos (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- single row table
  categoria_actual TEXT NOT NULL CHECK (categoria_actual IN ('founder', 'tradicional')),
  ultima_modificacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_modificacion_por UUID REFERENCES auth.users(id)
);

ALTER TABLE public.comisiones_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regimen_nuevos_medicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY comisiones_read ON public.comisiones_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY regimen_read ON public.regimen_nuevos_medicos
  FOR SELECT TO authenticated USING (true);

-- Seed: comisiones iniciales
INSERT INTO public.comisiones_config (categoria, porcentaje) VALUES
  ('founder', 5.00),
  ('tradicional', 10.00)
ON CONFLICT (categoria) DO NOTHING;

INSERT INTO public.regimen_nuevos_medicos (id, categoria_actual) VALUES
  (1, 'founder')
ON CONFLICT (id) DO NOTHING;

-- Sumar columna categoria a tabla medicos
ALTER TABLE public.medicos ADD COLUMN IF NOT EXISTS categoria TEXT
  CHECK (categoria IN ('founder', 'tradicional')) DEFAULT 'founder';

-- Todos los medicos existentes quedan como Founder
UPDATE public.medicos SET categoria = 'founder' WHERE categoria IS NULL;

ALTER TABLE public.medicos ALTER COLUMN categoria SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_medicos_categoria ON public.medicos(categoria);

-- Funcion helper para obtener la comision vigente para un medico
CREATE OR REPLACE FUNCTION public.get_comision_medico(p_medico_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_categoria TEXT;
  v_porcentaje NUMERIC;
BEGIN
  SELECT categoria INTO v_categoria FROM public.medicos WHERE id = p_medico_id;
  SELECT porcentaje INTO v_porcentaje FROM public.comisiones_config WHERE categoria = v_categoria;
  RETURN COALESCE(v_porcentaje, 5.00); -- fallback al 5% si algo falla
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN public.medicos.categoria IS 'Categoria administrativa invisible al medico. Solo se muestra en panel admin. Determina el porcentaje de comision que cobra Docto.';
