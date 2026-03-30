-- Rediseño de estados de turnos + expiración de reservas

-- 1. Actualizar constraint de estados
ALTER TABLE public.turnos DROP CONSTRAINT IF EXISTS turnos_estado_check;
ALTER TABLE public.turnos ADD CONSTRAINT turnos_estado_check
  CHECK (estado IN (
    'disponible',
    'reservado_pendiente',
    'confirmado',
    'en_curso',
    'completado',
    'cancelado',
    'bloqueado'
  ));

-- 2. Migrar datos existentes: "reservado" → "confirmado"
UPDATE public.turnos SET estado = 'confirmado' WHERE estado = 'reservado';

-- 3. Agregar columna de expiración
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS reservado_hasta timestamptz;

-- 4. Agregar columna de inicio de videollamada (para contador de duración)
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS iniciado_en timestamptz;

-- 5. Función para expirar reservas pendientes (ejecutar con pg_cron o Edge Function)
CREATE OR REPLACE FUNCTION public.expirar_reservas_pendientes()
RETURNS void AS $$
BEGIN
  UPDATE public.turnos
  SET estado = 'disponible',
      paciente_id = NULL,
      reservado_hasta = NULL
  WHERE estado = 'reservado_pendiente'
    AND reservado_hasta < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Política: pacientes pueden ver turnos reservado_pendiente propios
-- (ya cubierta por la policy existente que filtra por paciente_id)

-- 7. Política: actualizar turnos reservado_pendiente
DROP POLICY IF EXISTS "Pacientes reservan turnos disponibles" ON public.turnos;
CREATE POLICY "Pacientes reservan turnos disponibles"
  ON public.turnos FOR UPDATE TO authenticated
  USING (
    estado = 'disponible'
    OR (estado = 'reservado_pendiente' AND paciente_id IN (
      SELECT id FROM public.pacientes WHERE user_id = auth.uid()
    ))
  )
  WITH CHECK (
    paciente_id IN (SELECT id FROM public.pacientes WHERE user_id = auth.uid())
  );
