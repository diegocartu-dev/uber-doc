-- 017_metering_manual_gana.sql — la clasificación que fijó un humano no la pisa
-- el job. Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 014_encuentros_metering.sql.
--
-- ── QUÉ AGUJERO TAPA ─────────────────────────────────────────────────────────
-- La 014 dejó `facturado_periodo` con cinturón (trigger) y tirante (el guard de
-- `clasificar.ts`). `clasificacion_origen = 'manual_admin'` —la falla técnica
-- imputable que declara un humano de Docto, la que el job NO puede auto-detectar
-- (spec §6.1)— se quedó con el tirante solo: un `SELECT` fallido en el job
-- dejaba `intocables` vacío y el upsert siguiente le escribía
-- `clasificacion_origen: 'job'` encima. La declaración desaparecía y el
-- encuentro volvía a ser facturable, sin que nadie se enterara.
--
-- ── POR QUÉ PRESERVA EN VEZ DE RECHAZAR ──────────────────────────────────────
-- Porque el escritor es un upsert EN LOTE de hasta 500 filas. Un RAISE haría
-- fallar la corrida entera por una fila que el job no tenía que tocar: se
-- perderían 499 clasificaciones legítimas para proteger una. Acá el UPDATE pasa
-- —el reloj, los intervalos y los documentos se pueden refrescar sin problema,
-- son telemetría— pero los cuatro campos de la DECISIÓN vuelven a los de la
-- fila vieja. El humano gana sin romperle la corrida a nadie.
--
-- Un humano que corrige su propia declaración desde el /admin interno manda
-- `clasificacion_origen = 'manual_admin'` y este trigger no se mete.
--
-- El orden importa y está resuelto por el nombre: Postgres dispara los triggers
-- BEFORE de una tabla en orden alfabético, y `..._manual` va antes que
-- `..._sellado` — o sea que una fila YA FACTURADA sigue rebotando igual.

CREATE OR REPLACE FUNCTION encuentros_metering_manual_gana()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.clasificacion_origen = 'manual_admin'
     AND NEW.clasificacion_origen IS DISTINCT FROM 'manual_admin' THEN
    NEW.clasificacion        := OLD.clasificacion;
    NEW.clasificacion_origen := OLD.clasificacion_origen;
    NEW.clasificacion_motivo := OLD.clasificacion_motivo;
    NEW.clasificado_at       := OLD.clasificado_at;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_encuentros_metering_manual
  BEFORE UPDATE ON encuentros_metering
  FOR EACH ROW EXECUTE FUNCTION encuentros_metering_manual_gana();
