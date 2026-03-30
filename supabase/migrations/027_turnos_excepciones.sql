-- Estados extendidos para excepciones de turnos
ALTER TABLE public.turnos DROP CONSTRAINT IF EXISTS turnos_estado_check;
ALTER TABLE public.turnos ADD CONSTRAINT turnos_estado_check
  CHECK (estado IN (
    'disponible', 'reservado_pendiente', 'confirmado',
    'en_espera', 'en_curso', 'completado',
    'ausente_paciente', 'ausente_medico',
    'cancelado_paciente', 'cancelado_medico',
    'reprogramado', 'bloqueado'
  ));

-- Columnas adicionales
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS reprogramaciones int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sala_video_url text,
  ADD COLUMN IF NOT EXISTS reintegro_estado text
    CHECK (reintegro_estado IN ('pendiente', 'en_proceso', 'acreditado'));

-- Función ausente_paciente: si turno lleva 15 min en en_espera sin iniciarse
CREATE OR REPLACE FUNCTION public.marcar_ausente_paciente()
RETURNS void AS $$
BEGIN
  UPDATE public.turnos
  SET estado = 'ausente_paciente'
  WHERE estado = 'en_espera'
    AND NOW() > (
      fecha::timestamp + hora_inicio::interval + INTERVAL '15 minutes'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
