-- 028_duracion_consulta_libre.sql — La duración de consulta que fija la institución
-- deja de chocar contra una lista cerrada heredada del B2C.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
--
-- ── QUÉ PROBLEMA RESUELVE ────────────────────────────────────────────────────
-- En el B2C la duración la elige el propio profesional desde un desplegable de
-- tres opciones, y el CHECK de la tabla copiaba ese desplegable: 20, 30 o 45.
-- En Institucional la duración NO la elige el profesional — la fija la
-- institución al levantar las agendas (R10 de las reglas operativas), y el
-- piloto la configuró en 15 minutos, que es el estándar de una guardia
-- provincial.
--
-- El resultado era que el alta de CUALQUIER profesional de la instancia moría en
-- el INSERT, con el mensaje genérico "No se pudo crear el perfil del
-- profesional" en pantalla y la violación del constraint sepultada en los logs.
-- No es un caso de borde: es el primer paso de la puesta en marcha de una
-- instancia, y ninguna instancia con slots de 15 minutos podía dar de alta a
-- nadie.
--
-- ── POR QUÉ UN RANGO Y NO UNA LISTA MÁS LARGA ────────────────────────────────
-- Agregar el 15 a la lista dejaba el mismo problema una instancia más adelante:
-- la próxima que configure 10, 25 o 40 vuelve a chocar. El valor ya no sale de
-- un desplegable sino de `institucion_config.slot_duracion_min`, así que el
-- CHECK deja de ser un espejo de la UI y pasa a ser lo único que tiene que ser:
-- un cinturón contra el disparate (un cero, un negativo, una jornada entera
-- cargada por error en el campo equivocado). De ahí el rango 5–120.
--
-- No afloja ninguna garantía real: la duración de la instancia la valida el
-- panel de Institución al guardar la configuración, y este CHECK es el piso.

ALTER TABLE medicos DROP CONSTRAINT IF EXISTS medicos_duracion_consulta_check;

ALTER TABLE medicos ADD CONSTRAINT medicos_duracion_consulta_check
  CHECK (duracion_consulta BETWEEN 5 AND 120);
