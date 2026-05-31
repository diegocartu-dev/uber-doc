-- Ola 3 / 3B fix (hallazgo C1-bis auditoría Roberto): persistir el id de refund
-- de cada pata (médico / Docto) para decidir el reintento por estado PROPIO y no
-- por el monto refundeado global de MP (que puede incluir refunds externos no
-- relacionados → over-refund desde la cuenta de Docto). El cron decide la rama
-- por estos flags; getPaymentState queda solo como guard anti-over-refund.

ALTER TABLE public.refunds_pendientes
  ADD COLUMN IF NOT EXISTS medico_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS docto_refund_id TEXT;
