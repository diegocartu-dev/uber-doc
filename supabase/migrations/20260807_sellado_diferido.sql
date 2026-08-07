-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ ORDEN DE DESPLIEGUE: ESTA MIGRACIÓN VA **ANTES** DE CORRER EL BACKFILL.
--
-- Sin ella, `firma_logs` rechaza el método de atribución nuevo
-- ('sellado_diferido_plataforma') por el CHECK vigente y el sellado se revierte
-- documento por documento — el script lo reporta como error y no sella nada.
-- Es segura de aplicar sobre el código actual: agrega un valor permitido, dos
-- backstops y dos tablas nuevas. Nada de lo que hoy corre cambia de conducta.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- Sellado de integridad diferido sobre documentos emitidos ANTES de que el
-- sellado automático existiera (07/08/2026 19:09 UTC).
-- Dictamen legal 07/08/2026 (segunda parte) + decisión operativa del CEO.
--
-- ENCUADRE (importa para leer el resto del archivo):
-- La firma electrónica del art. 5 de la Ley 25.506 ocurrió AL EMITIRSE: el
-- profesional, con identidad validada y matrícula verificada, cerró la consulta
-- desde su sesión autenticada con el contenido a la vista. El art. 5 es
-- tecnológicamente neutro y no exige criptografía: ese acto fue la firma.
-- Lo que se aplica ahora es el SELLO CRIPTOGRÁFICO (RSA-SHA256 + log encadenado),
-- que es EVIDENCIA de esa firma — no la crea ni la reemplaza.
--
-- No se llama "firma retroactiva", "regularización", "refirmado" ni "backdating".
-- Ninguno de esos términos aparece acá, ni debe aparecer en código, mails o
-- tickets.
--
-- LÍMITE DURO, y es el que sostiene todo lo demás:
-- `firmado_at` es SIEMPRE el instante REAL del sellado (reloj del servidor, UTC).
-- Ningún campo, en ninguna tabla, puede contener una fecha de firma anterior a
-- la real. La fecha de emisión viaja aparte, en `contexto.emitido_at`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Método de atribución nuevo ───────────────────────────────────────────
-- El valor dice las DOS cosas que importan: que el sello fue posterior y que lo
-- aplicó la plataforma, no el profesional. Por eso no es 'diferido' ni
-- 'plataforma' a secas.
ALTER TABLE public.firma_logs
  DROP CONSTRAINT IF EXISTS firma_logs_metodo_atribucion_check;
ALTER TABLE public.firma_logs
  ADD CONSTRAINT firma_logs_metodo_atribucion_check
  CHECK (metodo_atribucion IN ('otp', 'sesion_medico', 'sellado_diferido_plataforma')) NOT VALID;

-- ─── 2. Coherencia del sellado diferido ──────────────────────────────────────
-- Sin OTP (no hubo segundo factor: no hubo request del médico) y con la fecha de
-- emisión declarada explícitamente en el contexto. Un log de sellado diferido que
-- no diga cuándo se emitió el documento no sirve para nada: la honestidad de la
-- operación ES tener las dos fechas juntas.
ALTER TABLE public.firma_logs
  DROP CONSTRAINT IF EXISTS firma_logs_sellado_diferido_check;
ALTER TABLE public.firma_logs
  ADD CONSTRAINT firma_logs_sellado_diferido_check
  CHECK (
    metodo_atribucion <> 'sellado_diferido_plataforma' OR (
      otp_id IS NULL
      AND contexto ? 'emitido_at'
      AND contexto->>'sellado_diferido' = 'true'
    )
  ) NOT VALID;

-- ─── 3. Backstop anti-antedatado (TODOS los métodos) ─────────────────────────
-- `created_at` lo pone la base (DEFAULT now()), así que una fila no puede
-- declarar una firma anterior a su propia inserción. Hace ESTRUCTURALMENTE
-- imposible el reproche de antedatar: no depende de que la aplicación se porte
-- bien.
--
-- Se escribe con EXTRACT(EPOCH FROM (a - b)) y no con `created_at - interval`
-- porque `timestamptz - interval` es STABLE (depende del huso de la sesión) y
-- PostgreSQL rechaza funciones no inmutables dentro de un CHECK. La resta
-- timestamptz - timestamptz sí es inmutable.
ALTER TABLE public.firma_logs
  DROP CONSTRAINT IF EXISTS firma_logs_firmado_at_no_antedatado;
ALTER TABLE public.firma_logs
  ADD CONSTRAINT firma_logs_firmado_at_no_antedatado
  CHECK (EXTRACT(EPOCH FROM (created_at - firmado_at)) <= 300) NOT VALID;

-- ─── 4. La fecha de emisión nunca puede ser posterior a la del sello ─────────
-- Va como TRIGGER y no como CHECK por la misma razón técnica de arriba: el cast
-- text→timestamptz es STABLE y un CHECK no lo admite. El trigger sí, y además
-- puede explicar el rechazo en castellano.
--
-- Solo mira las filas de sellado diferido: los caminos 'otp' y 'sesion_medico'
-- que hoy corren en producción no cambian en nada.
CREATE OR REPLACE FUNCTION public.firma_logs_sellado_diferido_coherente()
RETURNS TRIGGER AS $$
DECLARE
  emitido TIMESTAMPTZ;
BEGIN
  IF NEW.metodo_atribucion <> 'sellado_diferido_plataforma' THEN
    RETURN NEW;
  END IF;

  BEGIN
    emitido := (NEW.contexto->>'emitido_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Sellado diferido: contexto.emitido_at no es una fecha válida (%)',
      NEW.contexto->>'emitido_at';
  END;

  IF emitido IS NULL THEN
    RAISE EXCEPTION 'Sellado diferido: falta contexto.emitido_at (la fecha de emisión del documento)';
  END IF;

  IF emitido > NEW.firmado_at THEN
    RAISE EXCEPTION 'Sellado diferido: la emisión (%) no puede ser posterior al sello (%)',
      emitido, NEW.firmado_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_firma_logs_sellado_diferido ON public.firma_logs;
CREATE TRIGGER trg_firma_logs_sellado_diferido
  BEFORE INSERT ON public.firma_logs
  FOR EACH ROW EXECUTE FUNCTION public.firma_logs_sellado_diferido_coherente();

-- ─── 5. Constancia del lote y vía de objeción del profesional ────────────────
-- `firma_logs` es append-only (trigger anti-UPDATE + anti-DELETE + REVOKE): el
-- aviso al profesional y su eventual respuesta NO pueden guardarse en la fila del
-- log. Van acá, referenciados por `lote_id`, que también queda escrito en el
-- `contexto` de cada firma.
--
-- Por qué importa: el aviso sin objeción es lo que convierte un acto unilateral
-- de la plataforma en algo ratificado. Y si un profesional objeta, se revoca el
-- sello de ESE documento — el log no se toca nunca, se emite el estado "sin
-- sello" y la objeción queda registrada acá.
CREATE TABLE IF NOT EXISTS public.sellado_diferido_lote (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motivo            TEXT NOT NULL,
  dictamen_ref      TEXT NOT NULL,
  autorizado_por    TEXT NOT NULL,
  documentos_total  INT  NOT NULL,
  ejecutado_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  detalle           JSONB
);

CREATE TABLE IF NOT EXISTS public.sellado_diferido_avisos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id       UUID NOT NULL REFERENCES public.sellado_diferido_lote(id),
  medico_id     UUID NOT NULL REFERENCES public.medicos(id),
  enviado_at    TIMESTAMPTZ,
  mensaje_id    TEXT,
  respuesta     TEXT,
  respuesta_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un aviso por profesional y por lote (el backfill es reanudable: si se corta y
-- se vuelve a correr, no debe duplicar el aviso).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sellado_diferido_avisos_lote_medico
  ON public.sellado_diferido_avisos (lote_id, medico_id);

-- RLS activa sin policies = solo service role. Ni el médico ni el paciente leen
-- estas tablas desde la app; son registro interno de la operación.
ALTER TABLE public.sellado_diferido_lote   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sellado_diferido_avisos ENABLE ROW LEVEL SECURITY;

-- ─── 6. Documentación en la propia base ──────────────────────────────────────
COMMENT ON COLUMN public.firma_logs.metodo_atribucion IS
  '"otp" = segundo factor por mail; "sesion_medico" = sesión autenticada del médico al finalizar la consulta; "sellado_diferido_plataforma" = sello criptográfico aplicado por la plataforma DESPUÉS de la emisión sobre una firma electrónica preexistente (art. 5 Ley 25.506) — firmado_at es el instante REAL del sellado y contexto.emitido_at la fecha de emisión.';

COMMENT ON TABLE public.sellado_diferido_lote IS
  'Constancia de cada corrida de sellado de integridad diferido: motivo, dictamen que lo autoriza, responsable y total de documentos alcanzados.';

COMMENT ON TABLE public.sellado_diferido_avisos IS
  'Aviso al profesional por cada lote de sellado diferido y su eventual objeción. Existe porque firma_logs es append-only y no admite registrar nada posterior a la firma.';
