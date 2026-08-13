-- 012_acceso_reenvio.sql — El paciente puede pedir su enlace de nuevo (R19).
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 004_accesos_link.sql, 011_acceso_ciclo_vida.sql.
--
-- Hasta acá, TODO acceso lo emitía un operador: por eso `creado_por` era NOT
-- NULL contra `operadores`. El reenvío self-service (mock 02, estado F) rompe
-- ese supuesto: el que pide el enlace es el PACIENTE, desde una pantalla
-- pública, sin nadie del call center del otro lado. Meterle ahí un operador
-- "sistema" de mentira sería ensuciar la auditoría justo donde importa —
-- quién emitió cada llave de acceso.
--
-- Entonces: `creado_por` pasa a nullable y aparece `origen`, que dice de dónde
-- salió el token. Con las dos columnas, la auditoría queda honesta: o hay un
-- operador con nombre, o dice explícitamente que lo pidió el paciente.

ALTER TABLE accesos_link ALTER COLUMN creado_por DROP NOT NULL;

ALTER TABLE accesos_link
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'asignacion'
    CHECK (origen IN ('asignacion', 'reenvio_paciente', 'reprogramacion'));

-- Backstop del par: sin operador, el origen NO puede ser una asignación (esas
-- SIEMPRE las hace alguien). Al revés sí vale: un reenvío o una reprogramación
-- pueden venir de un operador o del propio paciente.
ALTER TABLE accesos_link ADD CONSTRAINT accesos_link_origen_coherente
  CHECK (creado_por IS NOT NULL OR origen <> 'asignacion');

-- El cooldown y el techo diario del reenvío se cuentan sobre las emisiones
-- recientes del paciente: el índice existente es solo (paciente_id).
CREATE INDEX IF NOT EXISTS idx_accesos_link_paciente_fecha
  ON accesos_link (paciente_id, created_at DESC);
