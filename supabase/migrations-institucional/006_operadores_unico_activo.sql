-- 006_operadores_unico_activo.sql — Unicidad de operador ACTIVO por cuenta.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
--
-- El alta en /admin/operadores hace check-then-insert sin transacción: dos
-- altas concurrentes del mismo email (o un doble submit que esquive el estado
-- del cliente) dejaban DOS filas activas para el mismo user_id.
-- elegirOperador() lo tolera, pero la ambigüedad contamina la auditoría de
-- `asignaciones` (Etapa 2): ¿cuál operador_id firmó? Este índice parcial lo
-- prohíbe a nivel DB; la action mapea el 23505 a un mensaje claro.
--
-- Parcial a propósito: los INACTIVOS no tienen límite (la baja no borra, y un
-- mismo user puede darse de baja y de alta varias veces), y los tipo 'ia'
-- (user_id NULL) tampoco — su identidad es la API key, no la cuenta.

CREATE UNIQUE INDEX uniq_operadores_user_id_activo
  ON operadores (user_id)
  WHERE activo AND user_id IS NOT NULL;
