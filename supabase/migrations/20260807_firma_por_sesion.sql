-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ ORDEN DE DESPLIEGUE: ESTA MIGRACIÓN VA **ANTES** DEL DEPLOY DEL CÓDIGO.
--
-- No es una preferencia de prolijidad. Si el código sale primero, el insert en
-- `firma_logs` falla (columnas metodo_atribucion/firmante/contexto/log_hash
-- inexistentes, y otp_id todavía NOT NULL), la firma se revierte por diseño y
-- TODOS los documentos emitidos en esa ventana salen con la leyenda ámbar
-- "Documento sin sello electrónico de verificación". Para la integridad de los
-- datos es fail-safe; para el paciente que se lleva esa receta a la farmacia, no.
--
-- Es segura de aplicar sobre el código VIEJO (solo agrega columnas y relaja un
-- NOT NULL: nada de lo que hoy corre se rompe), así que el orden correcto no
-- tiene costo. Si por lo que sea el código saliera primero, el cron
-- `documentos-sin-sello` avisa por mail dentro de la hora y los logs del
-- servidor dicen "MIGRACIÓN FALTANTE".
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- Firma electrónica por atribución de sesión + endurecimiento de firma_logs
-- Dictamen legal 07/08/2026 (punto 3: "el log ES la defensa").
--
-- CONTEXTO: la firma electrónica de documentos existía como motor pero nunca se
-- llamó (114 documentos entregados, 0 firmados). El acto de voluntad del médico
-- es el click en "Finalizar consulta" con el contenido a la vista; la firma se
-- ejecuta del lado del servidor en ese mismo instante, atribuida a la sesión
-- autenticada del médico (identidad biométrica + matrícula REFEPS aguas arriba).
--
-- Como la carga de acreditar la firma electrónica es de Docto (art. 5 in fine,
-- Ley 25.506), el log tiene que registrar TODO el sustrato de identificación y
-- ser append-only y encadenado.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. otp_id deja de ser obligatorio: la firma por sesión no usa OTP.
--    (El OTP sigue siendo obligatorio cuando metodo_atribucion = 'otp' — ver CHECK.)
ALTER TABLE public.firma_logs ALTER COLUMN otp_id DROP NOT NULL;

-- 2. Campos nuevos del log.
ALTER TABLE public.firma_logs
  -- Cómo se atribuyó la firma: 'otp' (segundo factor por mail) o
  -- 'sesion_medico' (sesión autenticada del médico al finalizar la consulta).
  ADD COLUMN IF NOT EXISTS metodo_atribucion TEXT NOT NULL DEFAULT 'otp',
  -- Snapshot del firmante al momento de firmar (NO FK: la matrícula, las
  -- jurisdicciones y el estado REFEPS cambian con el tiempo).
  ADD COLUMN IF NOT EXISTS firmante JSONB,
  -- Circunstancias: canal, consulta/turno, completada_at, tipo de documento,
  -- fecha de emisión y referencia a la aceptación de T&C del médico.
  ADD COLUMN IF NOT EXISTS contexto JSONB,
  -- Encadenamiento: hash del log anterior del mismo médico.
  ADD COLUMN IF NOT EXISTS log_anterior_hash TEXT,
  -- Hash de esta fila (sobre su serialización canónica + log_anterior_hash).
  ADD COLUMN IF NOT EXISTS log_hash TEXT;

-- 3. Coherencia del método de atribución.
--    NOT VALID: no re-valida filas históricas (no las hay, pero es defensivo).
ALTER TABLE public.firma_logs
  DROP CONSTRAINT IF EXISTS firma_logs_metodo_atribucion_check;
ALTER TABLE public.firma_logs
  ADD CONSTRAINT firma_logs_metodo_atribucion_check
  CHECK (metodo_atribucion IN ('otp', 'sesion_medico')) NOT VALID;

ALTER TABLE public.firma_logs
  DROP CONSTRAINT IF EXISTS firma_logs_otp_requerido_check;
ALTER TABLE public.firma_logs
  ADD CONSTRAINT firma_logs_otp_requerido_check
  CHECK (metodo_atribucion <> 'otp' OR otp_id IS NOT NULL) NOT VALID;

-- Un log es de receta XOR de documento.
ALTER TABLE public.firma_logs
  DROP CONSTRAINT IF EXISTS firma_logs_objeto_unico_check;
ALTER TABLE public.firma_logs
  ADD CONSTRAINT firma_logs_objeto_unico_check
  CHECK (num_nonnulls(receta_id, documento_id) = 1) NOT VALID;

-- 4. Encadenamiento verificable: una sola cadena por médico, sin bifurcaciones.
--    Si dos firmas concurrentes leen la misma punta, la segunda choca contra
--    este índice y la aplicación reintenta con la punta nueva.
CREATE UNIQUE INDEX IF NOT EXISTS idx_firma_logs_cadena_medico
  ON public.firma_logs (medico_id, log_anterior_hash)
  WHERE log_anterior_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_firma_logs_log_hash
  ON public.firma_logs (log_hash)
  WHERE log_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_firma_logs_documento
  ON public.firma_logs (documento_id)
  WHERE documento_id IS NOT NULL;

-- 5. Append-only de verdad.
--    Un "registro inmutable" que la app puede reescribir no es inmutable.
--    El DELETE ya estaba bloqueado por trg_no_delete_firma_logs (mig. 20260522).
CREATE OR REPLACE FUNCTION public.prevent_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es append-only: no se permite UPDATE', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_update_firma_logs ON public.firma_logs;
CREATE TRIGGER trg_no_update_firma_logs
  BEFORE UPDATE ON public.firma_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_update();

-- Cinturón además del trigger: ningún rol de aplicación puede siquiera intentarlo.
REVOKE UPDATE, DELETE ON public.firma_logs FROM anon, authenticated, service_role;

COMMENT ON TABLE public.firma_logs IS
  'Registro append-only de actos de firma electrónica (no-repudio). Retención 10 años (Ley 26.529). Encadenado por médico vía log_anterior_hash/log_hash. NO se actualiza ni se borra: trigger trg_no_update_firma_logs + trg_no_delete_firma_logs.';
COMMENT ON COLUMN public.firma_logs.metodo_atribucion IS
  '"otp" = segundo factor por mail; "sesion_medico" = sesión autenticada del médico al finalizar la consulta (art. 5 Ley 25.506).';
