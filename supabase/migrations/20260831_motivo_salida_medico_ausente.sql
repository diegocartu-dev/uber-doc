-- La resolución automática de un turno/CI con médico ausente ahora cierra la
-- entrada de la sala de espera (antes quedaba abierta: fantasma "esperando" en
-- el panel admin + recordatorios al profesional por una atención ya resuelta;
-- caso 30/08: 18 horas de fantasma sobre un turno resuelto y reembolsado a los
-- 21 minutos). El motivo de salida dice lo que PASÓ: el profesional nunca entró
-- a atender. No es `cancelado_medico` (acción explícita) ni `medico_no_acepto`
-- (pedido de CI sin tomar).
ALTER TABLE sala_espera_entradas DROP CONSTRAINT sala_espera_entradas_motivo_salida_check;
ALTER TABLE sala_espera_entradas ADD CONSTRAINT sala_espera_entradas_motivo_salida_check CHECK (
  motivo_salida = ANY (ARRAY[
    'atendido'::text, 'cancelado_paciente'::text, 'cancelado_medico'::text,
    'timeout_sistema'::text, 'cancelado_admin'::text, 'medico_no_acepto'::text,
    'medico_ausente'::text
  ])
);
