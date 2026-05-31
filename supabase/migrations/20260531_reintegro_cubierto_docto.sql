-- Ola 3 / 3B fix (hallazgo I3 auditoría Roberto): estado terminal del recurso
-- cuando un refund se escala a cobertura manual de Docto por CVU. Sin esto, el
-- turno/consulta queda en 'pendiente' para siempre tras escalar y el dash de
-- admin (3D) no puede distinguir "pendiente de reintento" de "ya cubrió Docto".

ALTER TABLE public.turnos DROP CONSTRAINT IF EXISTS turnos_reintegro_estado_check;
ALTER TABLE public.turnos ADD CONSTRAINT turnos_reintegro_estado_check
  CHECK (reintegro_estado IN ('pendiente','usado_reprogramacion','reembolsado','fee_pendiente','cubierto_docto'));

ALTER TABLE public.consultas DROP CONSTRAINT IF EXISTS consultas_reintegro_estado_check;
ALTER TABLE public.consultas ADD CONSTRAINT consultas_reintegro_estado_check
  CHECK (reintegro_estado IN ('pendiente','reembolsado','fee_pendiente','cubierto_docto'));
