-- 003_asignacion.sql — Deltas de asignación sobre las tablas clonadas del B2C
-- + acuerdos de servicio + auditoría append-only.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 002_operadores.sql (FKs a operadores).
--
-- Secuenciamiento: hasta que la Etapa 2 traiga el flujo institucional de
-- agendas ('acordado'/'ofrecido'), el flujo CLONADO del B2C (crearAgendaModelo,
-- que escribe 'clinica_virtual'/'consultorio_privado') queda cortado POR CÓDIGO
-- con un mensaje amigable (guard esInstitucional() en
-- src/lib/agenda/crear-agenda.ts) — sin ese corte, el CHECK nuevo lo haría
-- morir con un error de constraint pelado.

-- ── §3.1 Columnas nuevas sobre tablas clonadas ───────────────────────────────
-- No hace falta turnos.origen='institucional': en la instancia dedicada TODO
-- es institucional (el modo lo da la env; la auditoría fina, asignado_por).

ALTER TABLE turnos
  ADD COLUMN asignado_por uuid REFERENCES operadores(id),
  ADD COLUMN asignado_via text CHECK (asignado_via IN ('panel','api')),
  ADD COLUMN asignada_at timestamptz;          -- ancla del plazo de CI/turno sin pago

ALTER TABLE consultas
  ADD COLUMN asignado_por uuid REFERENCES operadores(id),
  ADD COLUMN asignado_via text CHECK (asignado_via IN ('panel','api')),
  ADD COLUMN asignada_at timestamptz;

-- ── §3.2 Re-CHECK de canal_origen — los tres motores ─────────────────────────
-- El otorgador levanta 'acordado'; el profesional publica 'ofrecido'; la CI
-- institucional es siempre 'espontaneo'. generar-slots ya propaga canal_origen
-- del modelo al slot.
--
-- ⚠ Nombres de constraint: los CHECK nacieron inline sin nombre en
-- 036_consultorio_privado.sql / 038_agenda_modelos_canal.sql, o sea con el
-- nombre default de Postgres (<tabla>_<columna>_check). Pero la historia del
-- proyecto incluye DDL directo por Management API (la razón de ser del
-- baseline): si el nombre real difiere, un DROP IF EXISTS sería un no-op
-- SILENCIOSO y el ADD dejaría DOS CHECKs contradictorios sobre una columna
-- NOT NULL (viejo: 'clinica_virtual'/'consultorio_privado'; nuevo:
-- 'acordado'/'ofrecido' — intersección vacía) → ningún INSERT pasa y el fallo
-- aparece recién en runtime. Por eso: pre-check que ABORTA la migración si el
-- constraint esperado no existe, DROP sin IF EXISTS (que falle fuerte), y
-- post-check de que cada tabla queda con EXACTAMENTE UN CHECK sobre la columna.
-- Si el pre-check aborta: verificar el nombre real contra el dump de baseline
-- (scripts/institucional/dump-schema-prod.ts) y corregir ACÁ.

DO $$
DECLARE
  esperado text;
BEGIN
  FOREACH esperado IN ARRAY ARRAY[
    'turnos_canal_origen_check',
    'consultas_canal_origen_check',
    'agenda_modelos_canal_origen_check'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = esperado AND contype = 'c'
    ) THEN
      RAISE EXCEPTION 'No existe el CHECK "%" — el nombre real difiere del default. Verificar contra el dump de baseline y corregir 003_asignacion.sql antes de aplicar.', esperado;
    END IF;
  END LOOP;
END $$;

-- ⚠ EXTENSIÓN DE ALCANCE (reportada — protocolo de sprint, requiere OK del
-- CEO): la spec §3.2 especifica solo los DROP/ADD CONSTRAINT. Los tres
-- ALTER ... DEFAULT de abajo son delta necesario: el DEFAULT clonado
-- ('clinica_virtual') violaría el CHECK nuevo en el primer INSERT que lo use.
-- Consecuencia operativa deliberada: código clonado que inserte sin
-- canal_origen explícito pasa de "default inválido" a "NOT NULL violation" —
-- mismo resultado final (falla), pero decidido a propósito y visible.

ALTER TABLE turnos DROP CONSTRAINT turnos_canal_origen_check;
ALTER TABLE turnos ADD CONSTRAINT turnos_canal_origen_check
  CHECK (canal_origen IN ('acordado','ofrecido'));
-- En la instancia el canal se escribe SIEMPRE explícito (viene del modelo de agenda).
ALTER TABLE turnos ALTER COLUMN canal_origen DROP DEFAULT;

ALTER TABLE consultas DROP CONSTRAINT consultas_canal_origen_check;
ALTER TABLE consultas ADD CONSTRAINT consultas_canal_origen_check
  CHECK (canal_origen IN ('espontaneo'));      -- CI institucional = siempre espontáneo
ALTER TABLE consultas ALTER COLUMN canal_origen SET DEFAULT 'espontaneo';

ALTER TABLE agenda_modelos DROP CONSTRAINT agenda_modelos_canal_origen_check;
ALTER TABLE agenda_modelos ADD CONSTRAINT agenda_modelos_canal_origen_check
  CHECK (canal_origen IN ('acordado','ofrecido'));
ALTER TABLE agenda_modelos ALTER COLUMN canal_origen DROP DEFAULT;

-- Post-check: exactamente UN CHECK sobre canal_origen por tabla (si quedaron
-- dos, algo del pre-check mintió — abortar acá y no en runtime).
DO $$
DECLARE
  t text;
  n int;
BEGIN
  FOREACH t IN ARRAY ARRAY['turnos','consultas','agenda_modelos'] LOOP
    SELECT count(*) INTO n
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND c.conrelid = t::regclass
      AND pg_get_constraintdef(c.oid) ILIKE '%canal_origen%';
    IF n <> 1 THEN
      RAISE EXCEPTION 'La tabla "%" quedó con % CHECKs sobre canal_origen (esperado: exactamente 1).', t, n;
    END IF;
  END LOOP;
END $$;

-- ── §3.3 acuerdos_servicio — el contrato individual, con vigencias ───────────
-- El default de horas vive en institucion_config.acuerdo_horas_semana_default;
-- acá va el acuerdo de ESE profesional.

CREATE TABLE acuerdos_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id uuid NOT NULL REFERENCES medicos(id),
  horas_semanales numeric(4,1) NOT NULL,
  vigente_desde date NOT NULL,
  vigente_hasta date                               -- NULL = sin fin definido
);

CREATE INDEX idx_acuerdos_servicio_medico ON acuerdos_servicio (medico_id, vigente_desde);

-- ── §3.3 asignaciones — auditoría append-only + insumo del "X de Y" ──────────
-- Cada acción de un operador queda acá. El reparto equitativo cuenta sobre
-- esta tabla (asignadas menos canceladas/reprogramadas), NO sobre estados de
-- turnos. `detalle` registra el resultado de los avisos (fire-and-forget CON
-- registro — lección fallas silenciosas).

CREATE TABLE asignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operador_id uuid NOT NULL REFERENCES operadores(id),
  tipo text NOT NULL CHECK (tipo IN ('turno','ci')),
  recurso_id uuid NOT NULL,
  paciente_id uuid NOT NULL,
  medico_id uuid NOT NULL,
  accion text NOT NULL CHECK (accion IN ('asignada','reprogramada','cancelada','reenvio_aviso')),
  via text NOT NULL CHECK (via IN ('panel','api')),
  detalle jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Conteo semanal por médico (priorización) y lookup por recurso (auditoría).
CREATE INDEX idx_asignaciones_medico_fecha ON asignaciones (medico_id, created_at);
CREATE INDEX idx_asignaciones_recurso ON asignaciones (tipo, recurso_id);

-- RLS activo SIN policies: solo service role (la vía de asignación entera).
ALTER TABLE acuerdos_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE asignaciones ENABLE ROW LEVEL SECURITY;
