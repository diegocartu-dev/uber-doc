-- Decisión de producto (Diego, 13/07/2026): un turno REPROGRAMADO re-ofrece su
-- horario origen. Se agrega 'reprogramado' a la exclusión del índice parcial:
-- la fila reprogramada es histórico/contable (crédito usado o turno movido), no
-- retiene el horario.
--
-- Además arregla un bug LATENTE introducido por 20260713_indice_parcial_turnos:
-- las RPCs reprogramar_turno_atomico / reprogramar_turno_medico setean
-- estado='reprogramado' sobre una fila cuyo estado previo podía estar EXCLUIDO
-- del índice (cancelado_paciente con crédito) — al pasar a un estado INCLUIDO,
-- la fila re-entra al índice y choca (23505) si el slot re-creado al cancelar
-- (u otro activo) ocupa la misma clave → la reprogramación fallaría entera.
-- Con 'reprogramado' excluido, ese UPDATE nunca puede chocar.
--
-- Sigue garantizando UN solo turno activo por slot: quedan dentro disponible,
-- bloqueado, reservado_pendiente, confirmado, en_espera, en_curso y
-- bloqueado_sin_cobro.
BEGIN;
DROP INDEX public.turnos_medico_fecha_hora_uq;
CREATE UNIQUE INDEX turnos_medico_fecha_hora_uq
  ON public.turnos (medico_id, fecha, hora_inicio)
  WHERE estado NOT IN ('cancelado_paciente', 'cancelado_medico', 'ausente_paciente', 'ausente_medico', 'completado', 'reprogramado');
COMMIT;
