-- La CI aceptada y sin pagar deja de ser tierra de nadie (decisiones Diego, 10/09/2026).
--
-- Medido sobre las 12 CI aceptadas desde el 19/08: 6 se pagaron y 6 no. De esas 6,
-- CINCO las canceló el profesional a mano, y a dos pacientes les cancelaron la
-- consulta 24 y 30 segundos después de aceptarla — menos que el pago más rápido de
-- la historia (23 s) y muy por debajo del más lento (137 s). No fue "el paciente no
-- paga": fue una ventana que no existió.
--
-- Esta migración habilita cuatro cosas:
--
-- 1) BORRAR CONSULTAS DEJA DE SER POSIBLE PARA EL PROFESIONAL.
--    Había una policy de DELETE que autorizaba a cada médico a borrar físicamente
--    sus propias consultas, y código (huérfano, sin montar) que la usaba. Hoy nada
--    se borró —cero rastros huérfanos en documentos, sala de espera y eventos— y las
--    FK de documentos/consentimientos/recetas bloquean el borrado de cualquier
--    consulta con historia. O sea que la puerta estaba abierta por accidente, no por
--    diseño. Se cierra: una atención es un registro clínico, no una fila descartable.
--    Nadie pierde nada: las canceladas ya desaparecen solas del panel del médico
--    (solo lista esperando/aceptada/pagada/en_curso).
--
-- 2) `sin_pago_plazo`: el desenlace nuevo. Hasta hoy una CI aceptada y sin pagar no
--    tenía plazo — ningún cron la miraba (resolver-vencidas mira pagada/en_curso,
--    sin-respuesta mira esperando) y el profesional esperaba hasta cansarse (12, 15,
--    29 y 62 minutos en los casos reales). Ahora la cierra el sistema a los 10 min.
--
-- 3) `consultas.cierre_evidencia`: lo que sabíamos del paciente en el momento del
--    cierre, escrito en la base. Hoy eso vive SOLO en los registros del servidor, que
--    duran 8 días: por eso los dos casos de agosto ya no se pueden reconstruir. Un
--    jsonb para no migrar cada vez que haya un dato nuevo que valga la pena guardar.
--
-- 4) `sala_espera_entradas.ultimo_latido_at`: la última vez que el paciente dio señal
--    de estar MIRANDO la pantalla. Es lo que decide si el WhatsApp al paciente sale o
--    no: al que está mirando no se le manda nada, y al que se fue le llega justo
--    cuando se fue. Va acá y no en `consultas` porque esta tabla ya representa "el
--    paciente está en la sala", vive poco, y no conviene escribir cada 20 segundos en
--    la tabla que guarda la atención.

-- 1) El profesional ya no puede borrar consultas.
DROP POLICY IF EXISTS "Médicos pueden eliminar sus consultas" ON consultas;

-- 2) Desenlace nuevo: venció el plazo de pago con la consulta ya aceptada.
ALTER TABLE consultas DROP CONSTRAINT IF EXISTS consultas_resolucion_motivo_check;
ALTER TABLE consultas ADD CONSTRAINT consultas_resolucion_motivo_check CHECK (
  resolucion_motivo IS NULL OR resolucion_motivo = ANY (ARRAY[
    'retiro_paciente',
    'cambio_profesional',
    'cancelo_profesional',
    'cancelacion_admin',
    'sin_respuesta_plazo',
    'sin_pago_plazo'
  ])
);

-- 3) La evidencia del cierre, en la base y no en los logs.
ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS cierre_evidencia jsonb;

-- 4) Señal de presencia del paciente en la sala.
ALTER TABLE sala_espera_entradas
  ADD COLUMN IF NOT EXISTS ultimo_latido_at timestamptz;

-- El cron de plazo busca por (estado, aceptada_at) sobre las impagas: índice parcial,
-- que es el patrón que ya usa el repo para las colas de los crons.
CREATE INDEX IF NOT EXISTS consultas_aceptada_sin_pago_idx
  ON consultas (aceptada_at)
  WHERE estado = 'aceptada' AND pago_id IS NULL;

-- ── Corrección de la revisión adversarial (10/09, mismo día) ────────────────
-- El cierre por falta de pago NO puede salir de la sala como `timeout_sistema`.
-- Ese valor tiene dueño: `sala-espera-diaria` levanta TODAS las filas con ese
-- motivo de las últimas 24 h y le avisa al profesional que plantó pacientes
-- (PASO 2 de ese cron). Usarlo acá le mandaría un reproche al profesional que
-- aceptó en 25 segundos y esperó 10 minutos — exactamente lo contrario de lo que
-- este sprint viene a arreglar. Motivo propio, que además deja el dato separado.
ALTER TABLE sala_espera_entradas DROP CONSTRAINT IF EXISTS sala_espera_entradas_motivo_salida_check;
ALTER TABLE sala_espera_entradas ADD CONSTRAINT sala_espera_entradas_motivo_salida_check CHECK (
  motivo_salida = ANY (ARRAY[
    'atendido',
    'cancelado_paciente',
    'cancelado_medico',
    'timeout_sistema',
    'cancelado_admin',
    'medico_no_acepto',
    'medico_ausente',
    'sin_pago_plazo'
  ])
);

-- El índice acompaña al filtro real del cron. La primera versión filtraba por
-- `pago_id IS NULL`, y eso dejaba fuera para siempre a la consulta cuyo pago fue
-- RECHAZADO: `handleRejected` escribe `pago_id` sin tocar el estado, así que esa
-- fila quedaba en `aceptada` con pago_id no nulo y el cron no la miraba nunca —
-- ni aviso, ni cierre, contra la promesa que la pantalla le hace al profesional.
-- La condición correcta es "sin pago ACREDITADO".
DROP INDEX IF EXISTS consultas_aceptada_sin_pago_idx;
CREATE INDEX IF NOT EXISTS consultas_aceptada_sin_pago_idx
  ON consultas (aceptada_at)
  WHERE estado = 'aceptada' AND (mp_status IS NULL OR mp_status <> 'approved');

-- ── Segunda corrección, encontrada por la prueba end-to-end contra producción ─
-- `resolucion_motivo` tenía DOS check constraints, no uno: el original se llama
-- `consultas_resolucion_motivo_valida` (lo creó la migración del 19/08) y arriba
-- se amplió `consultas_resolucion_motivo_check`, un nombre supuesto que no
-- existía — el ALTER lo creó de cero y dejó el viejo intacto. Resultado: el cron
-- corría, respondía 200 y NO cerraba nada, porque el UPDATE chocaba contra el
-- constraint viejo. Un `DROP ... IF EXISTS` sobre un nombre inventado no falla:
-- no hace nada, y por eso el error salió recién al ejecutarse de verdad.
-- Se deja UNO SOLO, con el nombre real.
ALTER TABLE consultas DROP CONSTRAINT IF EXISTS consultas_resolucion_motivo_check;
ALTER TABLE consultas DROP CONSTRAINT IF EXISTS consultas_resolucion_motivo_valida;
ALTER TABLE consultas ADD CONSTRAINT consultas_resolucion_motivo_valida CHECK (
  resolucion_motivo IS NULL OR resolucion_motivo = ANY (ARRAY[
    'retiro_paciente',
    'cambio_profesional',
    'cancelo_profesional',
    'cancelacion_admin',
    'sin_respuesta_plazo',
    'sin_pago_plazo'
  ])
);
