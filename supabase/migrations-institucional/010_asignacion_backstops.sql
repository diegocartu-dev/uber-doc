-- 010_asignacion_backstops.sql — Backstops de la revisión de Etapa 2.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 003_asignacion.sql (columnas de asignación), 004_accesos_link.sql,
-- 008_padron.sql (padrón provisionado).
--
-- Tres piezas, todas salidas de la revisión pre-merge de la Etapa 2:
--
-- 1. LOCKS DE ASIGNACIÓN DE CI (hallazgos "CIs apiladas" y "regla del Uber
--    sin constraint"): `asignarCI` es check-then-INSERT sin atomicidad — dos
--    operadores (o el mismo, minutos después) podían apilar dos CIs 'pagada'
--    sobre el mismo profesional, o dos CIs sobre el mismo paciente en carrera.
--    El guard de aplicación se corrigió (mira 'pagada' además de 'en_curso'),
--    pero el candado de verdad vive acá: índices únicos parciales. En la
--    instancia TODA consulta es institucional, así que el índice no necesita
--    discriminar canal.
--
-- 2. accesos_link.enviado_a pasa a nullable (hallazgo "paciente sin canal =
--    sin token"): el acceso-link ahora se emite SIEMPRE que la asignación se
--    concreta, aunque no haya canal automático por donde mandarlo (el operador
--    lo recibe como fallback manual). Sin canal no hay "enviado a".
--
-- 3. padron_cambios (hallazgo "retargeting de contacto sin rastro"): bitácora
--    de cambios de contacto del padrón hechos por operadores. El acceso-link es
--    la llave de la cuenta del paciente: editar el celular/mail y asignar
--    redirige esa llave, y eso tiene que quedar trazado (quién, qué campo,
--    valor viejo → nuevo).

-- ── 1. Locks de asignación de CI ─────────────────────────────────────────────

-- Un profesional: a lo sumo UNA CI activa ('pagada' = asignada esperando que
-- abra sala; 'en_curso' = atendiendo). El segundo INSERT choca con 23505 y
-- asignar-ci lo traduce a `medico_no_disponible`.
CREATE UNIQUE INDEX idx_consultas_ci_activa_por_medico
  ON consultas (medico_id)
  WHERE estado IN ('pagada', 'en_curso');

-- Un paciente: a lo sumo UNA CI con compromiso (regla del Uber — misma
-- semántica que buscarEncuentroActivo). paciente_id = auth.users.id
-- (asimetría §3). El segundo INSERT choca con 23505 → `paciente_ocupado`.
CREATE UNIQUE INDEX idx_consultas_ci_activa_por_paciente
  ON consultas (paciente_id)
  WHERE estado IN ('pagada', 'en_curso');

-- ── 2. Acceso-link sin canal de envío ────────────────────────────────────────

ALTER TABLE accesos_link ALTER COLUMN enviado_a DROP NOT NULL;

-- ── 3. Bitácora de cambios de contacto del padrón ────────────────────────────

CREATE TABLE padron_cambios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id    uuid NOT NULL REFERENCES pacientes(id),
  operador_id    uuid REFERENCES operadores(id),
  campo          text NOT NULL CHECK (campo IN ('telefono', 'email')),
  valor_anterior text,
  valor_nuevo    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_padron_cambios_paciente ON padron_cambios (paciente_id, created_at);

-- RLS activo SIN policies + sin GRANT a los roles de PostgREST: solo service
-- role (misma disciplina que asignaciones/accesos_link).
ALTER TABLE padron_cambios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON padron_cambios FROM anon, authenticated;
