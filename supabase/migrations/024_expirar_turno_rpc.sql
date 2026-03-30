-- Función para expirar un turno específico (llamada via RPC cuando el contador llega a 0)
CREATE OR REPLACE FUNCTION public.expirar_turno(turno_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.turnos
  SET estado = 'disponible',
      paciente_id = NULL,
      reservado_hasta = NULL
  WHERE id = turno_id
    AND estado = 'reservado_pendiente'
    AND reservado_hasta < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
