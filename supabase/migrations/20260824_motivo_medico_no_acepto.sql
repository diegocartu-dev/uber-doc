-- `medico_no_acepto` como motivo de salida de la sala de espera.
--
-- QUÉ ARREGLA: cuando el plazo de 10 minutos libera un pedido que nadie aceptó
-- (#432/#435), la fila de la sala se cerraba como `cancelado_paciente`. Es
-- falso: el paciente no canceló nada — pidió una consulta, esperó, y **el médico
-- no la aceptó**.
--
-- POR QUÉ NO ALCANZA `timeout_sistema` (Diego, 24/08/2026): describe nuestra
-- plomería, no el hecho. Y hoy es un cajón que mezcla dos cosas distintas: una
-- fila que quedó colgada 24 h —problema técnico nuestro, la cierra el barrido
-- diario— y un pedido que nadie aceptó —problema de servicio—. Con el mismo
-- valor para las dos, la diferencia se pierde justo donde importa.
--
-- POR QUÉ IMPORTA MÁS ALLÁ DE LA PALABRA: es el dato con el que se mira, después,
-- por qué se pierden pacientes. `cancelado_paciente` cuenta la historia al revés
-- —parece que el paciente se arrepintió— cuando lo que pasó es que lo dejaron
-- esperando y no había oferta. Un dato falso que le echa la culpa al usuario es
-- peor que no tener el dato.
--
-- ORDEN: esta migración va ANTES del código. El CHECK vigente sólo admite cinco
-- valores; si el código sale primero, el UPDATE falla con 23514, la entrada de
-- sala NO se cierra, y el profesional sigue recibiendo recordatorios de un
-- paciente que ya no está esperando.
--
-- LAS DOS BASES: `sala_espera_entradas` es tabla compartida y el cron que la
-- cierra corre en los dos deploys. Espejo en
-- `supabase/migrations-institucional/032_motivo_medico_no_acepto.sql` — ver la
-- regla del README de esa carpeta (lección del 23/08).
--
-- Aditiva y reentrante: sólo ensancha un CHECK.

ALTER TABLE public.sala_espera_entradas
  DROP CONSTRAINT IF EXISTS sala_espera_entradas_motivo_salida_check;

ALTER TABLE public.sala_espera_entradas
  ADD CONSTRAINT sala_espera_entradas_motivo_salida_check
  CHECK (motivo_salida = ANY (ARRAY[
    'atendido'::text,
    'cancelado_paciente'::text,
    'cancelado_medico'::text,
    'timeout_sistema'::text,
    'cancelado_admin'::text,
    'medico_no_acepto'::text
  ]));

COMMENT ON COLUMN public.sala_espera_entradas.motivo_salida IS
  'Por qué el paciente dejó de esperar. "atendido" = se hizo la consulta; "cancelado_paciente" = la canceló él; "cancelado_medico" = la canceló el profesional; "medico_no_acepto" = venció el plazo de la solicitud sin que nadie la aceptara (el paciente NO canceló); "timeout_sistema" = la fila quedó colgada >24 h y la cerró el barrido diario (falla técnica, no de servicio); "cancelado_admin" = la bajó un admin, con motivo escrito.';
