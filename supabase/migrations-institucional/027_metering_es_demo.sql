-- 027_metering_es_demo.sql — La marca de demostración, también en el contador.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 014_encuentros_metering.sql, 025_demo_sesiones.sql.
--
-- ── QUÉ PROBLEMA RESUELVE ────────────────────────────────────────────────────
-- La 025 dejó los encuentros de una reunión de venta FUERA de `encuentros_metering`:
-- el clasificador los descartaba antes de escribir. Es la decisión correcta para
-- la FACTURA y es la decisión equivocada para todo lo demás, porque esa tabla no
-- es solo la factura — es también la única fuente del panel de la institución y
-- la precondición del sello semanal. Descartarlos producía dos daños:
--
--   1. EL SELLO QUEDABA TRABADO PARA SIEMPRE. La precondición del cierre cuenta
--      todo encuentro terminal del período que debería tener fila. Un encuentro
--      de demo terminal (alcanza con que el cron de vencidos marque
--      `ausente_paciente` a un paciente de utilería) nunca la iba a recibir: por
--      diseño, el clasificador lo saltaba. El cierre semanal y el mensual
--      fallaban en cada corrida, y el mensaje acusaba al cron de clasificación,
--      que estaba sano.
--
--   2. LA REUNIÓN NO SE PODÍA MOSTRAR. Después de hacer la videoconsulta en
--      vivo, el panel de la institución —la escena que cierra el guion— se
--      proyectaba en cero.
--
-- ── LA DECISIÓN ──────────────────────────────────────────────────────────────
-- El encuentro de demo ENTRA al contador, MARCADO. La que filtra es la
-- facturación, y solo ella: `src/lib/metering/facturacion.ts` no lee una sola
-- fila sin `es_demo = false` (hay un test que lee ese archivo y lo exige).
--
-- Consecuencia deliberada: una fila de demo NUNCA recibe `facturado_periodo`,
-- así que nunca queda inmutable y "limpiar reunión" siempre la puede borrar.

ALTER TABLE encuentros_metering
  ADD COLUMN IF NOT EXISTS es_demo boolean NOT NULL DEFAULT false;

-- La factura recorre períodos enteros filtrando por esta columna: el índice
-- parcial cubre el caso raro (las filas de demo) sin pesar sobre el común.
CREATE INDEX IF NOT EXISTS idx_encuentros_metering_demo
  ON encuentros_metering (medico_id) WHERE es_demo;
