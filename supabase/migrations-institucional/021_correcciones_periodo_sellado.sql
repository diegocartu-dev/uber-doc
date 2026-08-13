-- 021_correcciones_periodo_sellado.sql — LA ÚNICA PUERTA para corregir un mes
-- ya facturado, y el registro que la hace imposible de usar en silencio (R33).
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 014_encuentros_metering.sql, 017_metering_manual_gana.sql,
--           019_metering_backstops.sql, y `admin_users` del schema B2C.
-- Reentrante: se puede volver a aplicar sin romper nada. No es un detalle —
-- este archivo se corre a mano en el SQL Editor, y una migración que falla en la
-- segunda mitad (o un editor que corta el pegado) deja que el reintento reviente
-- por lo que YA estaba creado, con la mitad de las defensas puestas.
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
-- `metering_correcciones` que apunta a ESE encuentro Y QUE SE ESCRIBIÓ EN ESTA
-- MISMA TRANSACCIÓN. Y la función que la escribe es la misma que aplica el
-- cambio, en la misma transacción.
--
-- Son cuatro cierres, no uno, y cada uno tapa un camino distinto:
--
--   1. La constancia es DE UN SOLO USO (`c.txid = txid_current()`). Sin esa
--      condición, el id de una corrección vieja quedaba como permiso permanente
--      sobre esa fila: `SET LOCAL metering.correccion_id = '<id viejo>'` + UPDATE
--      volvía a abrir la puerta, indefinidamente y sin escribir nada nuevo.
--   2. El UPDATE habilitado solo puede tocar los CUATRO campos de la decisión
--      (`clasificacion`, `clasificacion_origen`, `clasificacion_motivo`,
--      `clasificado_at`). Antes lo único acotado era `facturado_periodo`: la
--      misma puerta servía para cambiarle el reloj, los documentos o el precio a
--      una fila facturada, mientras la constancia registraba solo el de→a de la
--      clasificación. La auditoría diría una cosa y la fila, otra.
--   3. LEVANTAR EL SELLO ya no es un camino. La 014 admitía un UPDATE que
--      pusiera `facturado_periodo = NULL` y nada más — o sea que los "tres pasos
--      por SQL" (levantar, corregir, volver a sellar) seguían disponibles para
--      cualquiera con service role, sin una sola fila de auditoría. Hoy
--      cualquier UPDATE sobre una fila sellada sin constancia de esta
--      transacción es un RAISE, incluido ese.
--   4. La constancia no se puede firmar con un UUID cualquiera: un trigger de
--      INSERT sobre `metering_correcciones` exige que `admin_user_id` sea un
--      superadministrador ACTIVO. Antes esa verificación vivía solo adentro de
--      la RPC, así que una constancia escrita a mano podía atribuirse a
--      cualquiera. (Se hace con trigger y no con FK a propósito: el mail se
--      guarda desnormalizado justamente para que la auditoría sobreviva a la
--      baja de la cuenta, y una FK impediría esa baja.)
--
-- Consecuencia buscada: no hay forma de corregir una fila sellada sin dejar
-- rastro. Ni desde el código, ni desde el SQL Editor del panel de Supabase.
-- Lo más que se puede hacer es escribir primero la constancia —firmada por un
-- superadmin activo, con motivo— y usarla en el acto, que es exactamente lo que
-- la regla pide.
--
-- ── LO QUE ESTA PUERTA NO CIERRA (y hay que saber al leer una auditoría) ─────
-- Todo lo de abajo requiere service role o el dueño de la base, o sea el mismo
-- puñado de personas que ya podía llamar a la RPC. No son agujeros para un
-- atacante externo: son los límites de lo que el registro puede AFIRMAR.
--
--   a) Desde el SQL Editor, una constancia habilita TODOS los UPDATE que esa
--      transacción haga sobre ESA fila, no uno solo. La constancia se escribe
--      con un de→a y después se puede terminar en otro valor; el registro
--      quedaría diciendo algo distinto de lo que la fila muestra. Por el camino
--      de la app no pasa: `corregir_encuentro_sellado()` escribe la constancia,
--      hace UN UPDATE y cierra el permiso (`set_config(..., '')`) en la misma
--      transacción. Cerrarlo del todo pediría un contador por transacción, que
--      es más maquinaria de la que este riesgo justifica.
--   b) La firma dice QUIÉN, no PRUEBA quién. El trigger verifica que
--      `admin_user_id` sea un superadministrador activo — no que sea el que está
--      ejecutando (con service role no hay usuario que consultar). Un
--      superadministrador puede firmar con el user_id de otro superadministrador
--      activo. Atarlo de verdad exigiría que la corrección viaje siempre por una
--      sesión autenticada, y hoy la escritura la hace el /admin interno con
--      service role.
--   c) El dueño de la base puede `ALTER TABLE … DISABLE TRIGGER` y hacer lo que
--      quiera. No hay defensa contra eso dentro de Postgres; queda registrado en
--      los logs del proyecto y es, deliberadamente, un acto ruidoso (el
--      procedimiento de limpieza del README lo usa, y avisa).
--
-- Lo que sí queda cerrado: la corrección de rutina, la del apuro, la del "lo
-- arreglo por SQL y después aviso". Esa era la que pasaba sin dejar nada.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. LOS ÍNDICES DEL SELLO
-- ─────────────────────────────────────────────────────────────────────────────
-- Desde que el sello se le pone al MES ENTERO (y no solo a lo facturable), tres
-- lecturas preguntan por `facturado_periodo` y ninguna tenía índice: la factura
-- de un mes ya cerrado, el listado de /admin/periodos y el barrido de meses que
-- quedaron sin sellar. La 014 solo indexó `(fecha_ar) WHERE facturable`.

CREATE INDEX IF NOT EXISTS idx_encuentros_metering_facturado
  ON encuentros_metering (facturado_periodo, fecha_ar)
  WHERE facturado_periodo IS NOT NULL;

-- El complemento: "¿queda algo del mes X sin sellar?" — la pregunta del cron de
-- cierre y de las filas que llegaron después del cierre.
CREATE INDEX IF NOT EXISTS idx_encuentros_metering_sin_sellar
  ON encuentros_metering (fecha_ar)
  WHERE facturado_periodo IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EL REGISTRO
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS metering_correcciones (
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

  corregido_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- En QUÉ TRANSACCIÓN se escribió. Es lo que vuelve la constancia de un solo
  -- uso: el trigger de `encuentros_metering` exige que sea la transacción en
  -- curso, así que el id de una corrección vieja ya no vuelve a abrir la
  -- puerta. Sin esto, una fila corregida legítimamente una vez quedaba
  -- desbloqueable para siempre.
  txid BIGINT NOT NULL DEFAULT txid_current()
);

CREATE INDEX IF NOT EXISTS idx_metering_correcciones_periodo ON metering_correcciones (periodo, corregido_at DESC);
CREATE INDEX IF NOT EXISTS idx_metering_correcciones_encuentro ON metering_correcciones (encuentro_id);

-- El registro es APPEND-ONLY. Una auditoría que se puede editar o borrar no es
-- una auditoría: sería el mismo agujero de antes con un paso más.
CREATE OR REPLACE FUNCTION metering_correcciones_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'metering_correcciones es append-only: una corrección registrada no se edita ni se borra. Si el registro está mal, agregá otra corrección que lo explique.';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_metering_correcciones_no_update ON metering_correcciones;
CREATE TRIGGER trg_metering_correcciones_no_update
  BEFORE UPDATE ON metering_correcciones
  FOR EACH ROW EXECUTE FUNCTION metering_correcciones_append_only();

DROP TRIGGER IF EXISTS trg_metering_correcciones_no_delete ON metering_correcciones;
CREATE TRIGGER trg_metering_correcciones_no_delete
  BEFORE DELETE ON metering_correcciones
  FOR EACH ROW EXECUTE FUNCTION metering_correcciones_append_only();

-- TRUNCATE no dispara triggers de fila (hallazgo S3 de la 019): mismo cierre
-- por los dos lados.
REVOKE TRUNCATE ON metering_correcciones FROM anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_metering_correcciones_no_truncate ON metering_correcciones;
CREATE TRIGGER trg_metering_correcciones_no_truncate
  BEFORE TRUNCATE ON metering_correcciones
  FOR EACH STATEMENT EXECUTE FUNCTION metering_no_truncate();

-- Quién puede FIRMAR una constancia. La RPC ya lo verifica, pero el guard de
-- una función es el guard de esa función: una constancia escrita a mano desde
-- el SQL Editor podía atribuirse a cualquier UUID y después servir de permiso.
-- Acá la firma se valida en la tabla, contra `admin_users`, y con el mismo
-- criterio de R33: superadministrador ACTIVO.
--
-- No es una FK a propósito. El mail se guarda desnormalizado para que la
-- auditoría siga diciendo quién fue aunque la cuenta se dé de baja; una FK
-- convertiría cada corrección vieja en un candado sobre esa baja.
CREATE OR REPLACE FUNCTION metering_correcciones_firma_valida()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_users a
     WHERE a.user_id = NEW.admin_user_id AND a.activo AND a.nivel = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'metering_correcciones: % no es un superadministrador de Docto activo. Una corrección de un período sellado la firma una persona con nombre (R33), no un UUID cualquiera.', NEW.admin_user_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_metering_correcciones_firma ON metering_correcciones;
CREATE TRIGGER trg_metering_correcciones_firma
  BEFORE INSERT ON metering_correcciones
  FOR EACH ROW EXECUTE FUNCTION metering_correcciones_firma_valida();

-- RLS activo SIN policies (patrón `encuentros_metering`): la lectura del
-- historial va por service role desde el /admin interno de Docto. La
-- institución no ve este registro desde su panel — y el profesional, menos.
ALTER TABLE metering_correcciones ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EL DESBLOQUEO, ATADO AL RASTRO
-- ─────────────────────────────────────────────────────────────────────────────
-- Se reescribe el trigger de la 014 agregándole UNA puerta: la transacción
-- tiene que traer en `metering.correccion_id` el id de una fila de
-- `metering_correcciones` que apunte a este mismo encuentro Y que se haya
-- escrito en ESTA transacción. Ese setting lo pone
-- `corregir_encuentro_sellado()` con `set_config(..., is_local => true)`, así
-- que muere con la transacción y no se filtra a la siguiente query de la
-- conexión.
--
-- Lo que la puerta NO permite, ni siquiera al superadmin:
--   · mover `facturado_periodo` (la fila sigue perteneciendo al mes que se
--     facturó: correr una consulta de octubre a noviembre no es corregir, es
--     rehacer dos facturas),
--   · tocar nada que no sea la decisión: el reloj, los documentos y el precio
--     son la foto de lo que pasó, y la constancia solo registra el de→a de la
--     clasificación,
--   · reusar una constancia vieja (`c.txid = txid_current()`), y
--   · borrar la fila (el trigger de DELETE de la 014 sigue intacto).
--
-- Y lo que se ELIMINA respecto de la 014: la rama que dejaba pasar un UPDATE
-- que solo pusiera `facturado_periodo = NULL`. Esa rama era el bypass de tres
-- pasos —levantar el sello, corregir la fila desprotegida, volver a sellar—
-- que este archivo dice cerrar; existía tal cual, disponible para cualquiera
-- con service role y sin escribir una sola fila de auditoría.

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
        WHERE c.id = correccion AND c.encuentro_id = OLD.id AND c.txid = txid_current()
     ) THEN
    IF NEW.facturado_periodo IS DISTINCT FROM OLD.facturado_periodo THEN
      RAISE EXCEPTION 'encuentros_metering: la corrección de la fila % no puede cambiar el período facturado (% → %). Corregir la clasificación sí; mudar la consulta de mes, no.', OLD.id, OLD.facturado_periodo, NEW.facturado_periodo;
    END IF;

    -- La puerta se abre SOLO para la decisión. Se neutralizan los cuatro campos
    -- que la corrección puede tocar; si después de eso la fila sigue siendo
    -- distinta, el UPDATE venía trayendo algo más de contrabando.
    candidato := NEW;
    candidato.clasificacion        := OLD.clasificacion;
    candidato.clasificacion_origen := OLD.clasificacion_origen;
    candidato.clasificacion_motivo := OLD.clasificacion_motivo;
    candidato.clasificado_at       := OLD.clasificado_at;
    IF candidato IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'encuentros_metering: la corrección de la fila % solo puede cambiar la clasificación (y su origen, motivo y fecha). El reloj, los documentos y el precio son la foto de lo que pasó, y la constancia no los registra.', OLD.id;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'encuentros_metering: la fila % ya fue facturada en el período % — está sellada, y eso incluye levantarle el sello. Solo el superadministrador de Docto puede corregirla, con motivo, desde /admin/periodos (queda registrada en metering_correcciones).', OLD.id, OLD.facturado_periodo;
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
    -- Una fila sin sellar es, o bien de un mes todavía abierto, o bien una que
    -- entró al contador DESPUÉS del cierre (y por eso quedó afuera de la
    -- factura emitida). En los dos casos sigue siendo del job: no hay nada
    -- congelado que desbloquear, y abrir esta puerta para ella solo agregaría
    -- una constancia sin objeto.
    RAISE EXCEPTION 'El encuentro % no está sellado: esta puerta es solo para filas de un período ya facturado. Si es de un mes cerrado, entró después del cierre (figura marcada en /admin/periodos) y se decide a mano.', p_encuentro_id;
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. EL COMBO DE MESES DE /admin/periodos
-- ─────────────────────────────────────────────────────────────────────────────
-- La pantalla necesita ~12 strings ("qué meses tienen filas selladas"), y los
-- sacaba leyendo `encuentros_metering` ENTERA y haciendo el `DISTINCT` en
-- memoria, en cada carga (`force-dynamic`). Con el volumen del piloto no se
-- nota; a 3.000 encuentros facturables por mes son ~36.000 filas en ~36
-- requests paginados cada vez que un admin abre la pantalla, y no deja de
-- crecer nunca porque los sellos no se archivan.
--
-- Un `DISTINCT` del lado del servidor, apoyado en el índice parcial de arriba.
-- No hace falta `SECURITY DEFINER`: la llama el /admin interno con service
-- role, que no pasa por RLS.

CREATE OR REPLACE FUNCTION periodos_sellados()
RETURNS TABLE (periodo TEXT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT facturado_periodo
    FROM encuentros_metering
   WHERE facturado_periodo IS NOT NULL
   ORDER BY 1 DESC
$$;

REVOKE ALL ON FUNCTION periodos_sellados() FROM PUBLIC;
REVOKE ALL ON FUNCTION periodos_sellados() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION periodos_sellados() TO service_role;

-- La puerta no se abre desde el navegador: ni el paciente con sesión de link ni
-- un operador de la institución pueden invocarla. La llama el /admin interno de
-- Docto con service role.
REVOKE ALL ON FUNCTION corregir_encuentro_sellado(UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION corregir_encuentro_sellado(UUID, TEXT, TEXT, UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION corregir_encuentro_sellado(UUID, TEXT, TEXT, UUID, TEXT) TO service_role;
