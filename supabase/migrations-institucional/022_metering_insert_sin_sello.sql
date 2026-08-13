-- 022_metering_insert_sin_sello.sql — una fila NACE sin sello. Siempre.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 014_encuentros_metering.sql, 021_correcciones_periodo_sellado.sql.
-- Reentrante: se puede volver a aplicar sin romper nada.
--
-- ── EL AGUJERO QUE TAPA ──────────────────────────────────────────────────────
-- La 014 y la 021 blindan la fila SELLADA contra UPDATE y DELETE, y la 021 dice
-- —con todas las letras— que "no hay forma de corregir una fila sellada sin
-- dejar rastro, ni desde el código, ni desde el SQL Editor". Faltaba una puerta:
-- el INSERT.
--
--   INSERT INTO encuentros_metering (..., facturado_periodo) VALUES (..., '2026-10');
--
-- Esa línea, tipeada en el SQL Editor del panel de Supabase, le agrega una línea
-- a una factura ya emitida. Ningún trigger se entera: los de la 014 son BEFORE
-- UPDATE y BEFORE DELETE, y sobre una fila que todavía no existe no hay nada que
-- proteger. No hace falta mala fe — alcanza con "recuperar a mano" una consulta
-- que el job perdió y querer dejarla en su mes.
--
-- Es EL MISMO agujero que el crítico del gate de la Etapa 8 (`cerrarMes` sobre
-- un mes ya cerrado sellaba lo que había llegado tarde), por el otro camino: el
-- sello aparece sobre una factura cerrada sin pasar por la puerta auditada de
-- R33.
--
-- ── LA REGLA ─────────────────────────────────────────────────────────────────
-- Una fila del contador NACE sin sello. El sello lo pone el cierre del mes
-- (`sellarPeriodo`, un UPDATE) y nadie más. Una fila que aparece después del
-- cierre se queda SIN sello a propósito: no entra a la factura emitida y se
-- muestra marcada en /admin/periodos, para que la decida un humano.
--
-- Consecuencia buscada: para meter una consulta en un mes ya facturado no queda
-- ningún camino de una línea. Hay que decidirlo, y la decisión se ve.

CREATE OR REPLACE FUNCTION encuentros_metering_nace_sin_sello()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.facturado_periodo IS NOT NULL THEN
    RAISE EXCEPTION 'encuentros_metering: una fila nueva no puede nacer sellada (se intentó insertar con facturado_periodo = %). El sello lo pone el cierre del mes sobre filas que ya existían; insertar una fila YA sellada le agrega una línea a una factura emitida sin pasar por la corrección auditada de R33. Si la consulta es de un mes ya cerrado, insertala SIN facturado_periodo: va a figurar marcada como llegada después del cierre en /admin/periodos.', NEW.facturado_periodo;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Dispara también en el `INSERT ... ON CONFLICT DO UPDATE` del job (Postgres
-- corre el BEFORE INSERT antes de detectar el conflicto). No molesta: las filas
-- que compone el clasificador no traen `facturado_periodo` — es justamente la
-- columna que el job no escribe nunca.
DROP TRIGGER IF EXISTS trg_encuentros_metering_insert_sellado ON encuentros_metering;

CREATE TRIGGER trg_encuentros_metering_insert_sellado
  BEFORE INSERT ON encuentros_metering
  FOR EACH ROW EXECUTE FUNCTION encuentros_metering_nace_sin_sello();
