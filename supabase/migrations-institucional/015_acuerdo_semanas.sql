-- 015_acuerdo_semanas.sql — LA BOLSA DE HORAS, semana por semana.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 003_asignacion.sql (acuerdos_servicio) y 014_encuentros_metering.sql.
--
-- ── QUÉ CUENTA COMO HORA CUMPLIDA (decisión de Diego, 12/08 — spec §6.4, R8) ──
-- La regla es híbrida, y esa es la parte que hay que entender antes de tocar
-- nada acá:
--   · TURNOS (acordado/ofrecido) — valen por PONER LA AGENDA. Los slots
--     levantados que ya transcurrieron cuentan, se hayan asignado o no: que la
--     agenda se llene es gestión de la institución, no del profesional. Solo
--     descuentan los slots donde faltó ÉL y las agendas que él canceló.
--   · CONSULTAS INMEDIATAS — valen por ATENDER. Cada CI facturable suma un
--     bloque igual a la duración de consulta que configuró la institución.
--     Estar "disponible" sin atender a nadie no suma nada.
-- En una frase, la que se le dice al cliente y al profesional:
--   "los turnos valen por poner la agenda; las consultas inmediatas valen por
--    atender".
--
-- ── POR QUÉ ESTA TABLA EXISTE SI TODO SE PUEDE CALCULAR ──────────────────────
-- La semana EN CURSO se calcula al vuelo (30 profesionales: es barato). Esta
-- tabla guarda la semana CERRADA, y guardarla no es cachear: es sellar. El
-- acuerdo de servicio de una semana que ya pasó no puede cambiar porque
-- alguien edite una agenda vieja o porque un webhook llegue tarde. Lo que la
-- institución vio el lunes tiene que seguir diciendo lo mismo en diciembre.

CREATE TABLE acuerdo_semanas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES medicos(id),
  semana_ar DATE NOT NULL,                    -- lunes de la semana AR (lunesDeSemanaAR)

  horas_comprometidas NUMERIC(4,1) NOT NULL,  -- del acuerdo vigente ESA semana
  minutos_cumplidos INT NOT NULL DEFAULT 0,   -- turnos por disposición + CI por bloques
  -- {"turnos": 1560, "ci": 210, "slots": 106, "slots_descontados": 2,
  --  "cis": 14, "cis_dentro_de_franja": 0, "motores": {...}}
  -- El desglose viaja para que "cumplió 26 de 30" se pueda explicar sin
  -- recalcular nada — que es justo lo que va a pedir el profesional que no
  -- esté de acuerdo con su número.
  desglose_motores JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 'abierta' no debería quedar acá casi nunca (la semana viva se calcula al
  -- vuelo); existe para que el cron pueda sellar en dos pasos si hace falta.
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
  cerrada_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (medico_id, semana_ar)
);

-- El panel pide una semana entera de una: (semana, profesional) en ese orden.
CREATE INDEX idx_acuerdo_semanas_semana ON acuerdo_semanas (semana_ar, medico_id);

-- RLS activo SIN policies: solo service role. R23 en la base — el panel de
-- cumplimiento existe de un solo lado del mostrador, y un profesional no puede
-- leer ni el suyo ni, mucho menos, el de un colega.
ALTER TABLE acuerdo_semanas ENABLE ROW LEVEL SECURITY;

-- ── INMUTABILIDAD DE LA SEMANA CERRADA ───────────────────────────────────────
-- Misma promesa que la 014 y, hasta acá, sin nada que la sostuviera: el único
-- guard era un `filter(f => !f.sellada)` en JS, y el escritor es un
-- `upsert(..., { onConflict: 'medico_id,semana_ar' })` — el patrón que
-- justamente pisa. El guard de la lib protege del código que ya conocemos; este
-- trigger protege del que venga después.
--
-- El ÚNICO UPDATE admitido sobre una fila cerrada es REABRIRLA
-- (`SET estado = 'abierta'`) y nada más en el mismo UPDATE. Sin esa segunda
-- mitad, "corregir los minutos y de paso dejarla cerrada" pasaría derecho, que
-- es exactamente lo que el sello previene. Corregir una semana cerrada se hace
-- en dos pasos, deliberadamente, y queda constancia de los dos.
CREATE OR REPLACE FUNCTION acuerdo_semanas_cerrada_inmutable()
RETURNS TRIGGER AS $$
DECLARE
  candidato acuerdo_semanas%ROWTYPE;
BEGIN
  IF OLD.estado <> 'cerrada' THEN
    RETURN NEW;
  END IF;
  candidato := NEW;
  candidato.estado     := OLD.estado;       -- neutraliza el único campo editable
  candidato.updated_at := OLD.updated_at;   -- el reloj puede acompañar la reapertura
  IF NEW.estado = 'cerrada' OR candidato IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'acuerdo_semanas: la semana % del profesional % está cerrada. Para corregirla, primero reabrila en un UPDATE aparte (SET estado = ''abierta'') y dejá constancia.', OLD.semana_ar, OLD.medico_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_acuerdo_semanas_cerrada
  BEFORE UPDATE ON acuerdo_semanas
  FOR EACH ROW EXECUTE FUNCTION acuerdo_semanas_cerrada_inmutable();

-- Borrar una semana cerrada es lo mismo que editarla, pero peor.
CREATE OR REPLACE FUNCTION acuerdo_semanas_cerrada_no_borra()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado = 'cerrada' THEN
    RAISE EXCEPTION 'acuerdo_semanas: la semana % del profesional % está cerrada y no se puede borrar.', OLD.semana_ar, OLD.medico_id;
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_acuerdo_semanas_cerrada_delete
  BEFORE DELETE ON acuerdo_semanas
  FOR EACH ROW EXECUTE FUNCTION acuerdo_semanas_cerrada_no_borra();

-- ── acuerdos_servicio: verificación, no creación ─────────────────────────────
-- La tabla del contrato individual ya nace en 003_asignacion.sql. Si esta
-- migración se aplicara sobre una base donde 003 no corrió, el cálculo de la
-- bolsa caería al default del config para TODOS los profesionales y nadie se
-- enteraría: los números saldrían, pero serían de otro acuerdo. Mejor abortar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'acuerdos_servicio') THEN
    RAISE EXCEPTION 'Falta la tabla acuerdos_servicio (migración 003_asignacion.sql). Aplicá 003 antes que esta.';
  END IF;
END $$;
