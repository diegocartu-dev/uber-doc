-- 026_acceso_sujeto.sql — El enlace de acceso también sirve para el PROFESIONAL.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 004_accesos_link.sql, 011, 012, 025_demo_sesiones.sql.
--
-- ── QUÉ CAMBIA Y POR QUÉ ─────────────────────────────────────────────────────
-- `accesos_link` nació con `paciente_id NOT NULL` y con la regla "exactamente un
-- recurso: o turno o consulta". Era correcto: el único que entraba por link era
-- el paciente, y siempre a UN encuentro concreto.
--
-- El modo demo agrega dos sujetos que esa forma no admite:
--
--   · el PROFESIONAL invitado — entra a su dashboard, no a un encuentro;
--   · el PACIENTE de la demo   — recibe su enlace ANTES de que el call center
--     le asigne nada (ese es el orden del guion de la reunión), así que en el
--     momento de emitirlo todavía no hay turno ni consulta.
--
-- Se extiende la tabla que YA existe en vez de inventar una hermana, porque lo
-- que hay que reusar es la MAQUINARIA, no la forma: token solo hasheado,
-- intersticial que no mintea en el GET (el bot de WhatsApp quemaría el link),
-- minteo en el POST tras un gesto, chequeo de origen contra login-CSRF, los dos
-- frenos de intentos, la cookie del acceso y la revocación que además cierra
-- sesiones. Una tabla nueva sería una segunda implementación de todo eso, y la
-- segunda es siempre la que se olvida de un chequeo.
--
-- ── LA PUERTA NO SE ABRE MÁS DE LO NECESARIO ─────────────────────────────────
-- Un acceso SIN recurso es un permiso más ancho que uno atado a un turno: por
-- eso solo se permite si `es_demo` es verdadero. En la operación real de la
-- institución, el CHECK sigue exigiendo exactamente un recurso, igual que
-- antes — la propiedad de seguridad que la Etapa 3 auditó no se toca.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. El sujeto: paciente O profesional
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE accesos_link ALTER COLUMN paciente_id DROP NOT NULL;
ALTER TABLE accesos_link ADD COLUMN IF NOT EXISTS medico_id uuid REFERENCES medicos(id);
ALTER TABLE accesos_link ADD COLUMN IF NOT EXISTS es_demo boolean NOT NULL DEFAULT false;

-- Exactamente un sujeto. Sin esto, una fila con los dos en NULL sería un token
-- que valida y no loguea a nadie, y una con los dos cargados sería ambigua
-- justo en el momento de decidir a quién se mintea la sesión.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accesos_link_un_sujeto') THEN
    ALTER TABLE accesos_link ADD CONSTRAINT accesos_link_un_sujeto
      CHECK ((paciente_id IS NULL) <> (medico_id IS NULL));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. El recurso: sigue siendo obligatorio salvo en la demo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- El CHECK viejo (`accesos_link_un_recurso`, migración 004) decía "turno XOR
-- consulta" para toda fila. Se reemplaza por uno que dice lo mismo para la
-- operación real y admite las dos formas nuevas:
--
--   · profesional  → nunca lleva recurso (entra a su dashboard);
--   · paciente demo → puede no llevarlo todavía (el turno llega después).
--
-- ⚠ NOMBRES DE CONSTRAINT (misma trampa que documenta la 003): si el nombre
-- real difiere del esperado, el `DROP … IF EXISTS` es un no-op SILENCIOSO y la
-- tabla queda con DOS CHECKs contradictorios — el viejo exigiendo un recurso y
-- el nuevo permitiendo que falte — o sea que ningún acceso de demo se puede
-- insertar y el fallo aparece recién en la reunión. Por eso el pre-check aborta
-- antes de tocar nada.
--
-- El único caso legítimo en que el pre-check no encuentra `accesos_link_origen_check`
-- es una base donde la 012 se aplicó con otro nombre: verificarlo contra
-- `pg_constraint` y corregir ACÁ, nunca saltear el bloque.

DO $$
DECLARE
  esperado text;
BEGIN
  FOREACH esperado IN ARRAY ARRAY['accesos_link_un_recurso', 'accesos_link_origen_check'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = esperado AND contype = 'c') THEN
      -- Reentrancia: si ya corrió esta migración, el viejo no está y el nuevo sí.
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accesos_link_recurso_coherente') THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'No existe el CHECK "%" — el nombre real difiere. Verificar contra pg_constraint y corregir 026_acceso_sujeto.sql antes de aplicar.', esperado;
    END IF;
  END LOOP;
END $$;

ALTER TABLE accesos_link DROP CONSTRAINT IF EXISTS accesos_link_un_recurso;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accesos_link_recurso_coherente') THEN
    ALTER TABLE accesos_link ADD CONSTRAINT accesos_link_recurso_coherente
      CHECK (
        -- Profesional: jamás con recurso.
        (medico_id IS NOT NULL AND turno_id IS NULL AND consulta_id IS NULL)
        OR
        -- Paciente con encuentro: la regla de siempre.
        (paciente_id IS NOT NULL AND ((turno_id IS NULL) <> (consulta_id IS NULL)))
        OR
        -- Paciente de demo, todavía sin encuentro asignado.
        (paciente_id IS NOT NULL AND es_demo AND turno_id IS NULL AND consulta_id IS NULL)
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. El origen 'demo'
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La 012 dejó `creado_por` nullable y agregó `origen`, con un backstop: sin
-- operador, el origen NO puede ser 'asignacion'. El enlace de la demo lo emite
-- un ADMIN DE DOCTO desde /admin/demo, que no es un operador de la institución
-- (no tiene fila en `operadores`), así que necesita su propio origen.

ALTER TABLE accesos_link DROP CONSTRAINT IF EXISTS accesos_link_origen_check;
ALTER TABLE accesos_link ADD CONSTRAINT accesos_link_origen_check
  CHECK (origen IN ('asignacion', 'reenvio_paciente', 'reprogramacion', 'demo'));

-- Índice de la revocación por sujeto: "apagá todos los enlaces de este
-- profesional" (limpiar reunión, o el participante que se va).
CREATE INDEX IF NOT EXISTS idx_accesos_link_medico
  ON accesos_link (medico_id, created_at DESC) WHERE medico_id IS NOT NULL;
