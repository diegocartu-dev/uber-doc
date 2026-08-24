-- 032 — espejo de `supabase/migrations/20260824_motivo_medico_no_acepto.sql`.
--
-- `sala_espera_entradas` es tabla COMPARTIDA y el cron que la cierra
-- (`resolver-consultas-vencidas` → `sin-respuesta.ts`) corre en los dos deploys:
-- `vercel.json` es uno solo. Sin esta migración, en la instancia el UPDATE falla
-- con 23514, la entrada de sala no se cierra, y el profesional sigue recibiendo
-- recordatorios de un paciente que ya no está.
--
-- Es exactamente el modo de falla del 22/08 (columna `recordatorios_enviados`
-- aplicada sólo en el B2C → cron caído 24 h acá) que motivó la regla del README:
-- **una migración sobre una tabla compartida son DOS aplicaciones, no una.**
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
