-- 023_periodos_cerrados.sql — QUÉ MESES YA SE CERRARON, dicho explícitamente.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 014_encuentros_metering.sql, 019_metering_backstops.sql.
-- Reentrante: se puede volver a aplicar sin romper nada.
--
-- ── EL PROBLEMA: "CERRADO" SE INFERÍA DE LAS FILAS ───────────────────────────
-- Hasta acá, "¿este mes está cerrado?" se contestaba contando filas selladas:
-- `filasSelladas(periodo) > 0`. Para un mes con actividad es exacto. Para un mes
-- con CERO encuentros —el piloto arrancando, una instancia recién provisionada,
-- un mes de receso— da lo mismo que "nunca se cerró", y ahí la diferencia sí
-- importa:
--
--   · el barrido del cron lo ve como pendiente para siempre (o lo saltea para
--     siempre, según por dónde se lo mire), y
--   · si mucho después aparece UNA fila de ese mes —un webhook tardío, una
--     consulta recuperada a mano— el mes vuelve a parecer "abierto", el cierre
--     la sella y esa consulta entra a la factura de un mes que ya se cerró en
--     cero. Es el crítico del gate otra vez, por la única puerta que le quedaba:
--     la del mes vacío.
--
-- ── LA DECISIÓN ──────────────────────────────────────────────────────────────
-- Marca explícita. El cierre de un mes deja una fila acá, y a partir de ese
-- momento "cerrado" es un hecho registrado y no una inferencia sobre otra tabla.
-- Un mes marcado no vuelve al barrido ni con filas nuevas: esas son tardías, se
-- ven marcadas en /admin/periodos y las decide un humano — exactamente lo mismo
-- que pasa con un mes que cerró con actividad.
--
-- ── EL ORDEN IMPORTA, Y ES AL REVÉS DE LO QUE PARECE ─────────────────────────
-- Primero se SELLA y después se MARCA. Nunca al revés: la factura de un mes
-- marcado sale del sello, así que un mes marcado cuyas filas no se sellaron
-- facturaría CERO teniendo encuentros — un mes en blanco para el cliente. Si el
-- sello anda y la marca falla, en cambio, no se pierde nada: el mes sigue
-- cerrado por sus filas y la marca la escribe el barrido de mañana.
--
-- La marca es INMUTABLE por el mismo motivo que el resto de esta familia: si se
-- pudiera borrar, "cerrado" volvería a ser una opinión.

CREATE TABLE IF NOT EXISTS metering_periodos_cerrados (
  periodo TEXT PRIMARY KEY CHECK (periodo ~ '^\d{4}-\d{2}$'),

  cerrado_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- La foto del cierre, para poder auditar después sin recontar: cuántas filas
  -- quedaron selladas (todas las clasificaciones) y cuántas de ellas cobra la
  -- factura. Un mes cerrado en cero tiene los dos en 0, que es justamente el
  -- caso que esta tabla existe para poder afirmar.
  filas_selladas INTEGER NOT NULL DEFAULT 0,
  facturables INTEGER NOT NULL DEFAULT 0
);

-- Un mes cerrado no se reabre ni se borra. Mismo criterio que
-- `metering_correcciones`: un registro que se puede editar no registra nada.
CREATE OR REPLACE FUNCTION metering_periodos_cerrados_inmutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'metering_periodos_cerrados: un mes cerrado no se reabre ni se borra. El cierre es la promesa de que la factura de ese mes no se mueve más; si hay algo mal adentro, se corrige fila por fila con la puerta auditada de R33 (corregir_encuentro_sellado).';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_metering_periodos_cerrados_no_update ON metering_periodos_cerrados;
CREATE TRIGGER trg_metering_periodos_cerrados_no_update
  BEFORE UPDATE ON metering_periodos_cerrados
  FOR EACH ROW EXECUTE FUNCTION metering_periodos_cerrados_inmutable();

DROP TRIGGER IF EXISTS trg_metering_periodos_cerrados_no_delete ON metering_periodos_cerrados;
CREATE TRIGGER trg_metering_periodos_cerrados_no_delete
  BEFORE DELETE ON metering_periodos_cerrados
  FOR EACH ROW EXECUTE FUNCTION metering_periodos_cerrados_inmutable();

-- TRUNCATE no dispara triggers de fila (hallazgo S3 de la 019): mismo cierre por
-- los dos lados, y usando la misma función de la 019.
REVOKE TRUNCATE ON metering_periodos_cerrados FROM anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_metering_periodos_cerrados_no_truncate ON metering_periodos_cerrados;
CREATE TRIGGER trg_metering_periodos_cerrados_no_truncate
  BEFORE TRUNCATE ON metering_periodos_cerrados
  FOR EACH STATEMENT EXECUTE FUNCTION metering_no_truncate();

-- RLS activo SIN policies (patrón `encuentros_metering`): esto lo lee y lo
-- escribe el /admin interno de Docto con service role. La institución no cierra
-- nada (R32) y por lo tanto tampoco necesita ver esta tabla.
ALTER TABLE metering_periodos_cerrados ENABLE ROW LEVEL SECURITY;
