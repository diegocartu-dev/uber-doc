-- 019_metering_backstops.sql — los dos agujeros que quedaron abiertos en la
-- inmutabilidad del contador (hallazgos S3 y S4 del gate #405).
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 014_encuentros_metering.sql, 015_acuerdo_semanas.sql,
--           017_metering_manual_gana.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- S3 — TRUNCATE PASA POR ARRIBA DE LOS TRIGGERS DE FILA
-- ─────────────────────────────────────────────────────────────────────────────
-- Las 014 y 015 protegen lo sellado con triggers `FOR EACH ROW` sobre UPDATE y
-- DELETE. `TRUNCATE` no dispara ninguno de los dos: vacía la tabla entera sin
-- que ni un solo trigger de fila se entere. O sea que toda la maquinaria de
-- inmutabilidad —la que existe para que la factura de octubre siga diciendo lo
-- mismo en diciembre— se saltea con una línea.
--
-- No es una hipótesis rebuscada: `TRUNCATE` es exactamente lo que alguien
-- escribe para "limpiar y volver a correr el job" en un ambiente que cree que
-- es de prueba. Y en esta instancia, esas filas son el respaldo de una factura
-- ya emitida.
--
-- Se cierra por los dos lados, porque cada uno tapa lo que el otro no:
--   · el REVOKE le saca el permiso a los roles de la API (incluido service
--     role, que es con el que corre TODO el código de la instancia), y
--   · el trigger `BEFORE TRUNCATE` frena también al dueño de la tabla, que es
--     con quien se entra por el SQL Editor del panel de Supabase — el camino
--     real por el que esto pasaría.

REVOKE TRUNCATE ON encuentros_metering FROM anon, authenticated, service_role;
REVOKE TRUNCATE ON acuerdo_semanas     FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION metering_no_truncate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'La tabla % no se puede vaciar con TRUNCATE: sostiene facturación ya emitida y cumplimiento sellado. Si de verdad hay que borrar algo, hacelo con DELETE fila por fila (los triggers de sello van a rechazar lo que está facturado) y dejá constancia.',
    TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_encuentros_metering_no_truncate ON encuentros_metering;
CREATE TRIGGER trg_encuentros_metering_no_truncate
  BEFORE TRUNCATE ON encuentros_metering
  FOR EACH STATEMENT EXECUTE FUNCTION metering_no_truncate();

DROP TRIGGER IF EXISTS trg_acuerdo_semanas_no_truncate ON acuerdo_semanas;
CREATE TRIGGER trg_acuerdo_semanas_no_truncate
  BEFORE TRUNCATE ON acuerdo_semanas
  FOR EACH STATEMENT EXECUTE FUNCTION metering_no_truncate();

-- ─────────────────────────────────────────────────────────────────────────────
-- S4 — LA 017 NO PRESERVABA EL PRECIO DE LAS FILAS MANUALES
-- ─────────────────────────────────────────────────────────────────────────────
-- La 017 hace que la clasificación que fijó un humano gane sobre el job:
-- preserva `clasificacion`, `clasificacion_origen`, `clasificacion_motivo` y
-- `clasificado_at`. Le faltaba `precio_centavos`.
--
-- Por qué importa: el precio se congela en la fila justamente para que el CSV
-- de un mes ya facturado siga dando el mismo total cuando el precio suba (ver
-- el comentario de la 014). El job lo arrastra bien —lee el previo y lo
-- reescribe igual—, pero eso es el tirante: depende de que la lectura de filas
-- existentes no falle. Si falla, el job cae al precio VIGENTE y se lo escribe
-- encima a una fila que un humano había fijado, con un precio nuevo, sobre una
-- clasificación vieja. La fila queda diciendo dos cosas de épocas distintas.
--
-- El cinturón: si la fila es manual y el UPDATE no viene de otro humano, el
-- precio vuelve al que tenía. Un humano que corrige su propia declaración manda
-- `clasificacion_origen = 'manual_admin'` y este trigger no se mete, igual que
-- antes.

CREATE OR REPLACE FUNCTION encuentros_metering_manual_gana()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.clasificacion_origen = 'manual_admin'
     AND NEW.clasificacion_origen IS DISTINCT FROM 'manual_admin' THEN
    NEW.clasificacion        := OLD.clasificacion;
    NEW.clasificacion_origen := OLD.clasificacion_origen;
    NEW.clasificacion_motivo := OLD.clasificacion_motivo;
    NEW.clasificado_at       := OLD.clasificado_at;
    -- S4: el precio de una fila fijada a mano tampoco lo mueve el job.
    NEW.precio_centavos      := OLD.precio_centavos;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
