-- 020_asignaciones_gestion_manual.sql — el turno que la reprogramación NO pudo
-- resolver deja rastro.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 003_asignacion.sql.
--
-- ── QUÉ PROBLEMA CIERRA ──────────────────────────────────────────────────────
-- La propuesta de Nova muestra en naranja los turnos sin candidato ("Sin lugar
-- esta semana — queda para gestión manual del call center"), y los que el
-- operador desmarca a mano. Esa fila naranja era VISIBLE pero no AUDITADA:
-- ninguna llamada, ninguna escritura, ningún flag. El turno seguía en
-- `confirmado` con el profesional que acaba de avisar que no va a atender,
-- indistinguible de cualquier otro turno sano. Cerrada la pestaña, el único
-- rastro de que ese paciente quedó colgado desaparecía.
--
-- Ahora cada ítem irresoluble deja una fila en `asignaciones` con
-- `accion='gestion_manual'` y el motivo en `detalle`. Es la mitad que faltaba
-- de la promesa del mock: lo irresoluble se entrega CON destino claro.
--
-- ── NO MUEVE EL REPARTO ──────────────────────────────────────────────────────
-- `deltaDeAsignacion()` (src/lib/otorgador/oferta.ts) le da 0: no es un
-- paciente que alguien recibió ni uno que alguien perdió — es un turno que
-- sigue donde estaba, esperando una llamada.

ALTER TABLE asignaciones DROP CONSTRAINT IF EXISTS asignaciones_accion_check;

ALTER TABLE asignaciones
  ADD CONSTRAINT asignaciones_accion_check
  CHECK (accion IN ('asignada','reprogramada','cancelada','reenvio_aviso','gestion_manual'));
