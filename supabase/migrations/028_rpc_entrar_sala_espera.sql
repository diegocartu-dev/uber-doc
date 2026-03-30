-- Función RPC para que el paciente entre a sala de espera (bypass RLS)
CREATE OR REPLACE FUNCTION public.entrar_sala_espera(turno_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.turnos
  SET estado = 'en_espera'
  WHERE id = turno_id
    AND estado = 'confirmado';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
