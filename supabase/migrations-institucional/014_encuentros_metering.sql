-- 014_encuentros_metering.sql — El CONTADOR CONTRACTUAL de la instancia.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: el schema B2C ya provisionado (video_presencia viene de
-- supabase/migrations/20260606_resolucion_consultas_fase1.sql; documentos, de
-- 014_documentos.sql + 030_documentos_turno_id.sql) y 003_asignacion.sql.
--
-- ── QUÉ ES Y QUÉ NO ES ───────────────────────────────────────────────────────
-- Esta tabla es lo que se FACTURA: una fila por encuentro terminal, con el
-- reloj que la justifica y la clasificación contractual (spec §6.2). NO es
-- telemetría: la duración real, las reconexiones y la reincidencia salen de
-- `video_presencia` y `documentos` crudos, que quedan donde están. Chica y
-- auditable a propósito — es el papel que la institución va a mirar cuando
-- discuta una factura.
--
-- ── POR QUÉ UNA TABLA Y NO UNA VISTA ─────────────────────────────────────────
-- Porque el número tiene que quedar CONGELADO. Una vista recalcularía sobre
-- `video_presencia`, que es append-only pero cuyos eventos pueden llegar tarde
-- (webhooks reintentados), y la factura del mes pasado cambiaría sola. Acá el
-- job escribe una vez, el sello de facturación la congela, y cualquiera puede
-- reconstruir el porqué mirando `intervalos`.

CREATE TABLE encuentros_metering (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Identidad del encuentro ────────────────────────────────────────────────
  tipo TEXT NOT NULL CHECK (tipo IN ('consulta','turno')),
  recurso_id UUID NOT NULL,                 -- consultas.id | turnos.id
  motor TEXT NOT NULL CHECK (motor IN ('acordado','espontaneo','ofrecido')),  -- = canal_origen
  medico_id UUID NOT NULL REFERENCES medicos(id),
  -- ⚠ ASIMETRÍA HEREDADA DEL B2C (spec §3): `turnos.paciente_id` apunta a
  -- `pacientes.id` y `consultas.paciente_id` a `auth.users.id`. Acá se guarda
  -- EL VALOR DE LA FILA DE ORIGEN, tal cual, sin normalizar: normalizar exigiría
  -- un lookup que puede fallar, y este campo es para auditar un encuentro
  -- puntual, no para agrupar por paciente. Sin FK, por lo mismo.
  paciente_id UUID NOT NULL,
  especialidad TEXT,                        -- del profesional; agrupa el ausentismo del panel

  -- ── Cuándo (hora argentina, siempre) ───────────────────────────────────────
  semana_ar DATE NOT NULL,                  -- lunes de la semana AR (lunesDeSemanaAR)
  fecha_ar  DATE NOT NULL,                  -- día AR del encuentro (buckets del chart)

  -- ── El reloj (reconstruido desde video_presencia) ──────────────────────────
  medico_primer_join TIMESTAMPTZ,
  paciente_primer_join TIMESTAMPTZ,
  segundos_ambos_en_sala INT NOT NULL DEFAULT 0,
  -- Detalle auditable [{desde,hasta},...]: es la prueba del número de arriba.
  -- Sin esto, "estuvieron 47 segundos" es una afirmación sin respaldo.
  intervalos JSONB,

  -- ── Documentos emitidos (count sobre `documentos`) ─────────────────────────
  documentos_emitidos INT NOT NULL DEFAULT 0,

  -- ── El precio, CONGELADO en la fila ────────────────────────────────────────
  -- El precio por consulta vive en `institucion_config` y cambia (en Argentina
  -- eso pasa, no es hipótesis). Si la factura se calculara con el precio
  -- VIGENTE, el CSV de octubre bajado en enero diría otro total con las mismas
  -- líneas: el papel que respalda una factura ya emitida dejaría de ser
  -- reproducible. Por eso el precio viaja con el encuentro, se escribe UNA vez
  -- (la primera clasificación) y las reclasificaciones posteriores lo arrastran
  -- tal cual. Sin default: el que inserta una fila decide a qué precio se
  -- factura, siempre y explícitamente.
  precio_centavos INT NOT NULL,

  -- ── Clasificación contractual (R11-R12) ────────────────────────────────────
  clasificacion TEXT NOT NULL CHECK (clasificacion IN
    ('facturable','no_facturable_corta','ausente_paciente','ausente_profesional','falla_tecnica')),
  -- 'manual_admin' = un humano de Docto la fijó desde el /admin interno; el job
  -- NO la pisa nunca (spec §6.1: la falla técnica imputable no se auto-detecta).
  clasificacion_origen TEXT NOT NULL DEFAULT 'job'
    CHECK (clasificacion_origen IN ('job','manual_admin')),
  clasificacion_motivo TEXT,
  clasificado_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Sello de facturación: exportado el período, la fila se congela ─────────
  facturado_periodo TEXT CHECK (facturado_periodo ~ '^\d{4}-\d{2}$'),   -- 'AAAA-MM' | NULL

  UNIQUE (tipo, recurso_id)                 -- idempotencia del job
);

-- El panel pregunta SIEMPRE por semana (y el chart, por día dentro de ella).
CREATE INDEX idx_encuentros_metering_semana ON encuentros_metering (semana_ar, clasificacion);
CREATE INDEX idx_encuentros_metering_medico ON encuentros_metering (medico_id, semana_ar);
-- Facturación mensual: "todo lo facturable de octubre" sin escanear la tabla.
CREATE INDEX idx_encuentros_metering_fecha_facturable
  ON encuentros_metering (fecha_ar) WHERE clasificacion = 'facturable';

-- ── INMUTABILIDAD DE LO YA FACTURADO ─────────────────────────────────────────
-- El guard vive en la lib (`clasificar.ts` saltea las filas selladas), pero el
-- guard de la lib protege del código que YA conocemos. Este trigger protege del
-- que venga después: un backfill apurado, un /admin nuevo, una corrección "que
-- no toca nada". Una vez que la institución recibió la factura de octubre, la
-- fila que la sostiene no se toca más — y si hay que corregirla, se corrige a
-- mano levantando el sello, deliberadamente, no de costado.
-- El ÚNICO UPDATE admitido sobre una fila sellada es levantar el sello
-- (`SET facturado_periodo = NULL`) y NADA más en el mismo UPDATE. Sin esa
-- segunda mitad, "corregir la clasificación y de paso re-sellar en otro
-- período" pasaría derecho, que es exactamente lo que el sello previene.
CREATE OR REPLACE FUNCTION encuentros_metering_sellado_inmutable()
RETURNS TRIGGER AS $$
DECLARE
  candidato encuentros_metering%ROWTYPE;
BEGIN
  IF OLD.facturado_periodo IS NULL THEN
    RETURN NEW;
  END IF;
  candidato := NEW;
  candidato.facturado_periodo := OLD.facturado_periodo;  -- neutraliza el único campo editable
  IF NEW.facturado_periodo IS NOT NULL OR candidato IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'encuentros_metering: la fila % ya fue facturada en el período % — está sellada. Para corregirla, primero levantá el sello en un UPDATE aparte (SET facturado_periodo = NULL) y dejá constancia.', OLD.id, OLD.facturado_periodo;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_encuentros_metering_sellado
  BEFORE UPDATE ON encuentros_metering
  FOR EACH ROW EXECUTE FUNCTION encuentros_metering_sellado_inmutable();

-- Borrar una fila facturada es lo mismo que editarla, pero peor.
CREATE OR REPLACE FUNCTION encuentros_metering_sellado_no_borra()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.facturado_periodo IS NOT NULL THEN
    RAISE EXCEPTION 'encuentros_metering: la fila % está facturada (%) y no se puede borrar.', OLD.id, OLD.facturado_periodo;
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_encuentros_metering_sellado_delete
  BEFORE DELETE ON encuentros_metering
  FOR EACH ROW EXECUTE FUNCTION encuentros_metering_sellado_no_borra();

-- RLS activo SIN policies (patrón video_presencia / asignaciones): el panel
-- institucional y el job leen y escriben SIEMPRE por service role. Un paciente
-- con sesión de link no puede ver ni de refilón lo que se le factura a la
-- institución, y un profesional tampoco (R23: el cumplimiento vive de un solo
-- lado del mostrador).
ALTER TABLE encuentros_metering ENABLE ROW LEVEL SECURITY;
