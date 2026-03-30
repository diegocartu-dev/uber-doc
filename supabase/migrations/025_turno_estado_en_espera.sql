-- Agregar estado "en_espera" para cuando el paciente entra a la sala de espera del turno
ALTER TABLE public.turnos DROP CONSTRAINT IF EXISTS turnos_estado_check;
ALTER TABLE public.turnos ADD CONSTRAINT turnos_estado_check
  CHECK (estado IN (
    'disponible',
    'reservado_pendiente',
    'confirmado',
    'en_espera',
    'en_curso',
    'completado',
    'cancelado',
    'bloqueado'
  ));
