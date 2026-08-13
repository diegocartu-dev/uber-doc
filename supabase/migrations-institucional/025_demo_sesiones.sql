-- 025_demo_sesiones.sql — El MODO DEMO de la instancia institucional.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 002_operadores.sql, 004_accesos_link.sql, 008_padron.sql.
--
-- ── QUÉ ES ───────────────────────────────────────────────────────────────────
-- En una reunión de venta, LOS PARTICIPANTES SON LOS ACTORES: uno o dos entran
-- como profesionales, otro como paciente, y el circuito ocurre en vivo delante
-- del cliente. Esta migración es el modelo de esa reunión:
--
--   · `demo_sesiones`      — una fila por reunión.
--   · `demo_participantes` — una fila por persona invitada a esa reunión.
--   · las marcas de demostración sobre las tablas del producto.
--
-- ── POR QUÉ TODO ESTÁ MARCADO Y ES BORRABLE DE UNA ───────────────────────────
-- Los participantes son PERSONAS REALES (un ministro, un director de hospital)
-- y lo que se carga de ellos —nombre y celular— es dato personal de gente que
-- vino a una reunión, no de un paciente del padrón provincial. Por eso:
--
--   1. Nada de esto se escribe jamás en el repo (que es público): los datos
--      viven acá y solo acá.
--   2. Todo cuelga de `demo_sesiones` con FK, así que "limpiar la reunión" es
--      una operación acotada y completa, no una arqueología de filas sueltas.
--   3. Las filas del producto que nacen de una demo quedan MARCADAS
--      (`es_demo`), para que ni la factura ni el panel de la institución las
--      confundan con servicio real prestado.
--
-- ── LA MARCA VIAJA SOLA (trigger) Y NO A MANO ────────────────────────────────
-- `turnos.es_demo`, `consultas.es_demo` y `documentos.es_demo` los estampa un
-- trigger que mira al profesional y al paciente de la fila. Se decidió así —y
-- no con un campo que cada caller setea— porque los callers son muchos
-- (otorgador, Nova, agenda del médico, workspace, crons) y todos son código
-- CLONADO del B2C que no sabe nada de demos. Un solo caller que se olvidara de
-- la marca metería una consulta de mentira en la factura de la provincia.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La reunión
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS demo_sesiones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,                      -- "Reunión 1", "Ministerio — 21/08"
  fecha       date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date),
  notas       text,
  creada_por  uuid REFERENCES auth.users(id),     -- admin Docto que la abrió
  cerrada_at  timestamptz,                        -- "limpiar reunión" la cierra
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_sesiones_abiertas ON demo_sesiones (created_at DESC)
  WHERE cerrada_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Los participantes
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `estado` es lo que Diego mira en la pantalla mientras la reunión ocurre:
--   invitado   — se generó el enlace, todavía no lo tocó
--   entro      — minteó su sesión (lo escribe el POST de /acceso/entrar)
--   atendiendo — está en un encuentro (lo deriva la pantalla, no se guarda acá)

CREATE TABLE IF NOT EXISTS demo_participantes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id     uuid NOT NULL REFERENCES demo_sesiones(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  celular       text,                             -- E.164; puede faltar (el QR no lo necesita)
  rol           text NOT NULL CHECK (rol IN ('profesional','paciente')),
  estado        text NOT NULL DEFAULT 'invitado'
                CHECK (estado IN ('invitado','entro','atendiendo')),
  -- Lo que el sistema creó por él. Sin ON DELETE: el borrado es explícito y
  -- ordenado (ver `limpiarSesionDemo`), no una cascada que se lleve puesto algo
  -- que nadie miró.
  user_id       uuid REFERENCES auth.users(id),
  medico_id     uuid REFERENCES medicos(id),
  paciente_id   uuid REFERENCES pacientes(id),
  acceso_id     uuid REFERENCES accesos_link(id),
  entro_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Cada rol cuelga de SU tabla: un participante-profesional no puede tener ficha
-- de paciente y viceversa. Sin esto, un bug de la pantalla dejaría a la misma
-- persona en las dos puntas del mismo encuentro.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_participantes_rol_coherente') THEN
    ALTER TABLE demo_participantes ADD CONSTRAINT demo_participantes_rol_coherente
      CHECK (
        (rol = 'profesional' AND paciente_id IS NULL) OR
        (rol = 'paciente'    AND medico_id   IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_demo_participantes_sesion ON demo_participantes (sesion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_demo_participantes_acceso ON demo_participantes (acceso_id)
  WHERE acceso_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Las marcas sobre las tablas del producto
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ⚠ GRANTS DE COLUMNA (lección del outage 19-24/06): estas columnas nacen SIN
-- grant para `authenticated`, igual que el resto de las columnas internas de
-- `medicos`. Consecuencia obligatoria: NUNCA sumarlas a un SELECT que corra con
-- el cliente RLS — PostgREST falla la query ENTERA y devuelve null en silencio.
-- Todo lo que las lee usa service role (`src/lib/institucional/demo.ts`).

ALTER TABLE medicos   ADD COLUMN IF NOT EXISTS demo_sesion_id uuid REFERENCES demo_sesiones(id);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS demo_sesion_id uuid REFERENCES demo_sesiones(id);

CREATE INDEX IF NOT EXISTS idx_medicos_demo   ON medicos   (demo_sesion_id) WHERE demo_sesion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pacientes_demo ON pacientes (demo_sesion_id) WHERE demo_sesion_id IS NOT NULL;

-- El encuentro y el papel. `es_demo` en la FILA (y no derivado por join en cada
-- lectura) porque lo consulta el contador contractual, que corre sobre miles de
-- filas, y porque un encuentro nace demo y muere demo aunque después se borre
-- al profesional que lo originó.
ALTER TABLE turnos     ADD COLUMN IF NOT EXISTS es_demo boolean NOT NULL DEFAULT false;
ALTER TABLE consultas  ADD COLUMN IF NOT EXISTS es_demo boolean NOT NULL DEFAULT false;
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS es_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_turnos_demo     ON turnos     (medico_id) WHERE es_demo;
CREATE INDEX IF NOT EXISTS idx_consultas_demo  ON consultas  (medico_id) WHERE es_demo;
CREATE INDEX IF NOT EXISTS idx_documentos_demo ON documentos (medico_id) WHERE es_demo;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. El trigger que estampa la marca
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ⚠ ASIMETRÍA HEREDADA DEL B2C (spec §3): `turnos.paciente_id` y
-- `documentos.paciente_id` apuntan a `pacientes.id`; `consultas.paciente_id`, a
-- `auth.users.id`. El branch de abajo existe por eso y no por gusto.
--
-- La marca solo ESCALA (false → true) en los UPDATE: un slot que nació de un
-- profesional real y después se le asigna a un paciente de demo pasa a ser
-- demo; nada la puede volver a apagar sola.

CREATE OR REPLACE FUNCTION marcar_fila_demo() RETURNS trigger AS $$
DECLARE
  es boolean := false;
BEGIN
  IF NEW.medico_id IS NOT NULL THEN
    SELECT COALESCE((SELECT m.demo_sesion_id IS NOT NULL FROM medicos m WHERE m.id = NEW.medico_id), false)
      INTO es;
  END IF;

  IF NOT es AND NEW.paciente_id IS NOT NULL THEN
    IF TG_TABLE_NAME = 'consultas' THEN
      SELECT COALESCE((SELECT p.demo_sesion_id IS NOT NULL FROM pacientes p WHERE p.user_id = NEW.paciente_id), false)
        INTO es;
    ELSE
      SELECT COALESCE((SELECT p.demo_sesion_id IS NOT NULL FROM pacientes p WHERE p.id = NEW.paciente_id), false)
        INTO es;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.es_demo := COALESCE(OLD.es_demo, false) OR es;
  ELSE
    NEW.es_demo := es;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_turnos_es_demo ON turnos;
CREATE TRIGGER trg_turnos_es_demo
  BEFORE INSERT OR UPDATE OF medico_id, paciente_id ON turnos
  FOR EACH ROW EXECUTE FUNCTION marcar_fila_demo();

DROP TRIGGER IF EXISTS trg_consultas_es_demo ON consultas;
CREATE TRIGGER trg_consultas_es_demo
  BEFORE INSERT OR UPDATE OF medico_id, paciente_id ON consultas
  FOR EACH ROW EXECUTE FUNCTION marcar_fila_demo();

DROP TRIGGER IF EXISTS trg_documentos_es_demo ON documentos;
CREATE TRIGGER trg_documentos_es_demo
  BEFORE INSERT OR UPDATE OF medico_id, paciente_id ON documentos
  FOR EACH ROW EXECUTE FUNCTION marcar_fila_demo();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS — solo service role
-- ─────────────────────────────────────────────────────────────────────────────
-- Acá viven nombre y celular de personas reales que fueron a una reunión: RLS
-- activo SIN policies + sin GRANT para los roles de PostgREST, misma disciplina
-- que `accesos_link`. Se leen y se escriben SOLO desde el /admin interno de
-- Docto, con service role.

ALTER TABLE demo_sesiones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_participantes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON demo_sesiones      FROM anon, authenticated;
REVOKE ALL ON demo_participantes FROM anon, authenticated;
