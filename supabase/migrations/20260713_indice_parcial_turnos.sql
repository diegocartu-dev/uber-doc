-- Slot evaporado al cancelar (auditoría 13/07/2026): el índice único TOTAL sobre
-- (medico_id, fecha, hora_inicio) impedía re-ofrecer un horario tras cancelarlo
-- (la fila cancelada retiene la clave). Se vuelve PARCIAL: la unicidad aplica solo
-- a filas ACTIVAS; las terminales (histórico) pueden coexistir con un slot nuevo.
-- Sigue garantizando UN solo turno activo por slot (sin doble booking): quedan
-- dentro disponible, bloqueado, reservado_pendiente, confirmado, en_espera,
-- en_curso, reprogramado y bloqueado_sin_cobro (todo lo no terminal).
--
-- ⚠️ ORDEN DE DEPLOY: aplicar SOLO DESPUÉS de deployar el código sin ON CONFLICT
-- sobre turnos (generar-slots + crear-agenda vía insertarSlotsSinDuplicar; gate
-- Roberto #261 — un ON CONFLICT sin predicado no puede inferir un índice parcial
-- y fallaría cada corrida/creación de agenda). El código nuevo funciona con
-- ambos índices.
-- BEGIN/COMMIT explícito: atómico incluso ejecutado statement-por-statement.
BEGIN;
DROP INDEX public.turnos_medico_fecha_hora_uq;
CREATE UNIQUE INDEX turnos_medico_fecha_hora_uq
  ON public.turnos (medico_id, fecha, hora_inicio)
  WHERE estado NOT IN ('cancelado_paciente', 'cancelado_medico', 'ausente_paciente', 'ausente_medico', 'completado');
COMMIT;
