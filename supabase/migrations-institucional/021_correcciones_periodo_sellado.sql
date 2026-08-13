-- 021_correcciones_periodo_sellado.sql — LA ÚNICA PUERTA para corregir un mes
-- ya facturado, y el registro que la hace imposible de usar en silencio (R33).
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 014_encuentros_metering.sql, 017_metering_manual_gana.sql,
--           019_metering_backstops.sql, y `admin_users` del schema B2C.
--
-- ── LA REGLA (Diego, 13/08) ──────────────────────────────────────────────────
-- "Congelado para todos menos para uno. Un mes sellado es inmutable para la
--  institución, para los operadores y para el sistema. SOLO el
--  superadministrador de Docto puede corregirlo — para eso está: errores
--  existen. Toda corrección queda registrada (quién, cuándo, qué fila, qué
--  cambió y por qué), y ese registro es parte de la auditoría del período."
--
-- ── EL PROBLEMA QUE HABÍA QUE RESOLVER ───────────────────────────────────────
-- La 014 dejó lo sellado literalmente intocable: el único UPDATE que su trigger
-- admite sobre una fila con `facturado_periodo` es LEVANTAR el sello, y nada
-- más en el mismo UPDATE. O sea que la corrección legítima existía —levantar el
-- sello, corregir, volver a sellar— pero eran tres pasos por SQL, a mano, sin
-- nada que obligara a explicar por qué, y con la fila desprotegida en el medio.
-- "Dejá constancia" era una frase en un mensaje de error.
--
-- ── CÓMO SE CIERRA ───────────────────────────────────────────────────────────
-- El desbloqueo es explícito, acotado y ATADO a su rastro: el trigger de la 014
-- deja pasar el UPDATE únicamente si la transacción trae señalada una fila de
-- `metering_correcciones` que apunta a ESE encuentro. Y la función que la
-- escribe es la misma que aplica el cambio, en la misma transacción.
--
-- Consecuencia buscada: no hay forma de corregir una fila sellada sin dejar
-- rastro. Ni desde el código, ni desde el SQL Editor del panel de Supabase.
-- Lo más que se puede hacer es escribir primero la constancia — que es
-- exactamente lo que la regla pide.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EL REGISTRO
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE metering_correcciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Qué fila se tocó, y en qué período estaba sellada cuando se la tocó.
  encuentro_id UUID NOT NULL REFERENCES encuentros_metering(id),
  periodo TEXT NOT NULL CHECK (periodo ~ '^\d{4}-\d{2}$'),

  -- Quién. `user_id` de `admin_users` + el mail al momento de firmar: el mail
  -- se guarda DESNORMALIZADO a propósito, para que la auditoría siga diciendo
  -- quién fue aunque la cuenta se dé de baja o cambie de dirección.
  admin_user_id UUID NOT NULL,
  admin_email TEXT,

  -- Por qué. Obligatorio y con largo mínimo: "corrección" no explica nada, y
  -- este texto es lo único que va a quedar cuando alguien lea el registro
  -- dentro de dos años. El mismo mínimo vive en `src/lib/metering/correcciones.ts`.
  motivo TEXT NOT NULL CHECK (length(btrim(motivo)) >= 10),

  -- Qué cambió: la foto completa de los campos de decisión, antes y después.
  valores_antes JSONB NOT NULL,
  valores_despues JSONB NOT NULL,

  corregido_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metering_correcciones_periodo ON metering_correcciones (periodo, corregido_at DESC);
CREATE INDEX idx_metering_correcciones_encuentro ON metering_correcciones (encuentro_id);

-- El registro es APPEND-ONLY. Una auditoría que se puede editar o borrar no es
-- una auditoría: sería el mismo agujero de antes con un paso más.
CREATE OR REPLACE FUNCTION metering_correcciones_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'metering_correcciones es append-only: una corrección registrada no se edita ni se borra. Si el registro está mal, agregá otra corrección que lo explique.';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_metering_correcciones_no_update
  BEFORE UPDATE ON metering_correcciones
  FOR EACH ROW EXECUTE FUNCTION metering_correcciones_append_only();

CREATE TRIGGER trg_metering_correcciones_no_delete
  BEFORE DELETE ON metering_correcciones
  FOR EACH ROW EXECUTE FUNCTION metering_correcciones_append_only();

-- TRUNCATE no dispara triggers de fila (hallazgo S3 de la 019): mismo cierre
-- por los dos lados.
REVOKE TRUNCATE ON metering_correcciones FROM anon, authenticated, service_role;

CREATE TRIGGER trg_metering_correcciones_no_truncate
  BEFORE TRUNCATE ON metering_correcciones
  FOR EACH STATEMENT EXECUTE FUNCTION metering_no_truncate();

-- RLS activo SIN policies (patrón `encuentros_metering`): la lectura del
-- historial va por service role desde el /admin interno de Docto. La
-- institución no ve este registro desde su panel — y el profesional, menos.
ALTER TABLE metering_correcciones ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EL DESBLOQUEO, ATADO AL RASTRO
-- ─────────────────────────────────────────────────────────────────────────────
-- Se reescribe el trigger de la 014 agregándole UNA puerta: la transacción
-- tiene que traer en `metering.correccion_id` el id de una fila de
-- `metering_correcciones` que apunte a este mismo encuentro. Ese setting lo
-- pone `corregir_encuentro_sellado()` con `set_config(..., is_local => true)`,
-- así que muere con la transacción y no se filtra a la siguiente query de la
-- conexión.
--
-- Lo que la puerta NO permite, ni siquiera al superadmin:
--   · mover `facturado_periodo` (la fila sigue perteneciendo al mes que se
--     facturó: correr una consulta de octubre a noviembre no es corregir, es
--     rehacer dos facturas), y
--   · borrar la fila (el trigger de DELETE de la 014 sigue intacto).

CREATE OR REPLACE FUNCTION encuentros_metering_sellado_inmutable()
RETURNS TRIGGER AS $$
DECLARE
  candidato encuentros_metering%ROWTYPE;
  correccion UUID;
BEGIN
  IF OLD.facturado_periodo IS NULL THEN
    RETURN NEW;
  END IF;

  -- ¿Viene con su constancia? (R33 — la única excepción al congelamiento)
  BEGIN
    correccion := NULLIF(current_setting('metering.correccion_id', true), '')::UUID;
  EXCEPTION WHEN others THEN
    correccion := NULL;   -- un valor basura en el setting no abre nada
  END;

  IF correccion IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM metering_correcciones c
        WHERE c.id = correccion AND c.encuentro_id = OLD.id
     ) THEN
    IF NEW.facturado_periodo IS DISTINCT FROM OLD.facturado_periodo THEN
      RAISE EXCEPTION 'encuentros_metering: la corrección de la fila % no puede cambiar el período facturado (% → %). Corregir la clasificación sí; mudar la consulta de mes, no.', OLD.id, OLD.facturado_periodo, NEW.facturado_periodo;
    END IF;
    RETURN NEW;
  END IF;

  candidato := NEW;
  candidato.facturado_periodo := OLD.facturado_periodo;  -- neutraliza el único campo editable
  IF NEW.facturado_periodo IS NOT NULL OR candidato IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'encuentros_metering: la fila % ya fue facturada en el período % — está sellada. Solo el superadministrador de Docto puede corregirla, con motivo, desde /admin/periodos (queda registrada en metering_correcciones).', OLD.id, OLD.facturado_periodo;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LA FUNCIÓN QUE REGISTRA Y CORRIGE — EN LA MISMA TRANSACCIÓN
-- ─────────────────────────────────────────────────────────────────────────────
-- `SECURITY DEFINER` para que el desbloqueo no dependa de con qué rol se entre:
-- la puerta es esta función y ninguna otra. Sin EXECUTE para `anon` ni
-- `authenticated` (ver los GRANT del final): la llama el /admin interno con
-- service role, después de verificar que quien firma es superadmin — y acá se
-- vuelve a verificar contra `admin_users`, porque el service role no tiene
-- usuario y un guard de aplicación se puede saltear llamando a la RPC directo.
--
-- El orden importa: PRIMERO la constancia, DESPUÉS el cambio. Si el UPDATE
-- falla, la transacción entera se va abajo y no queda ni el registro ni la
-- corrección; si lo que falla es el registro, no hay corrección posible.

CREATE OR REPLACE FUNCTION corregir_encuentro_sellado(
  p_encuentro_id  UUID,
  p_clasificacion TEXT,
  p_motivo        TEXT,
  p_admin_user_id UUID,
  p_admin_email   TEXT DEFAULT NULL
)
RETURNS metering_correcciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fila       encuentros_metering%ROWTYPE;
  motivo     TEXT := btrim(coalesce(p_motivo, ''));
  registro   metering_correcciones%ROWTYPE;
BEGIN
  -- ── Quién firma ────────────────────────────────────────────────────────────
  IF p_admin_user_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM admin_users a
        WHERE a.user_id = p_admin_user_id AND a.activo AND a.nivel = 'super_admin'
     ) THEN
    RAISE EXCEPTION 'Solo un superadministrador de Docto activo puede corregir un período sellado (R33).';
  END IF;

  -- ── Por qué ────────────────────────────────────────────────────────────────
  -- Sin motivo no hay corrección. Es la mitad de la regla: el permiso existe
  -- porque los errores existen, pero un cambio sobre una factura emitida que
  -- nadie puede explicar después es indistinguible de un error nuevo.
  IF length(motivo) < 10 THEN
    RAISE EXCEPTION 'La corrección de un período sellado necesita un motivo de al menos 10 caracteres: quién lea esto dentro de dos años tiene que entender qué pasó.';
  END IF;

  IF p_clasificacion IS NULL OR p_clasificacion NOT IN
     ('facturable','no_facturable_corta','ausente_paciente','ausente_profesional','falla_tecnica') THEN
    RAISE EXCEPTION 'Clasificación inválida: %', p_clasificacion;
  END IF;

  -- ── Qué fila ───────────────────────────────────────────────────────────────
  SELECT * INTO fila FROM encuentros_metering WHERE id = p_encuentro_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El encuentro % no existe.', p_encuentro_id;
  END IF;
  IF fila.facturado_periodo IS NULL THEN
    RAISE EXCEPTION 'El encuentro % no está sellado: corregilo por el camino normal (clasificación manual). Esta puerta es solo para períodos ya facturados.', p_encuentro_id;
  END IF;
  IF fila.clasificacion = p_clasificacion THEN
    RAISE EXCEPTION 'El encuentro % ya está clasificado como %: no hay nada que corregir.', p_encuentro_id, p_clasificacion;
  END IF;

  -- ── La constancia, PRIMERO ─────────────────────────────────────────────────
  INSERT INTO metering_correcciones (
    encuentro_id, periodo, admin_user_id, admin_email, motivo,
    valores_antes, valores_despues
  ) VALUES (
    fila.id,
    fila.facturado_periodo,
    p_admin_user_id,
    nullif(btrim(coalesce(p_admin_email, '')), ''),
    motivo,
    jsonb_build_object(
      'clasificacion', fila.clasificacion,
      'clasificacion_origen', fila.clasificacion_origen,
      'clasificacion_motivo', fila.clasificacion_motivo,
      'clasificado_at', fila.clasificado_at,
      'precio_centavos', fila.precio_centavos
    ),
    jsonb_build_object(
      'clasificacion', p_clasificacion,
      'clasificacion_origen', 'manual_admin',
      'clasificacion_motivo', motivo,
      'precio_centavos', fila.precio_centavos
    )
  ) RETURNING * INTO registro;

  -- ── Y recién ahí, el cambio ────────────────────────────────────────────────
  -- `is_local => true`: el permiso vale para ESTA transacción y se apaga solo.
  PERFORM set_config('metering.correccion_id', registro.id::text, true);

  UPDATE encuentros_metering
     SET clasificacion        = p_clasificacion,
         clasificacion_origen = 'manual_admin',
         clasificacion_motivo = motivo,
         clasificado_at       = now()
   WHERE id = fila.id;

  -- Se cierra la puerta enseguida: la transacción podría seguir con otros
  -- UPDATE (hoy no lo hace, pero el permiso más chico posible es el que dura
  -- lo que dura el cambio).
  PERFORM set_config('metering.correccion_id', '', true);

  RETURN registro;
END $$;

-- La puerta no se abre desde el navegador: ni el paciente con sesión de link ni
-- un operador de la institución pueden invocarla. La llama el /admin interno de
-- Docto con service role.
REVOKE ALL ON FUNCTION corregir_encuentro_sellado(UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION corregir_encuentro_sellado(UUID, TEXT, TEXT, UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION corregir_encuentro_sellado(UUID, TEXT, TEXT, UUID, TEXT) TO service_role;
