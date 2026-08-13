-- 024_semanas_cerradas.sql — QUÉ SEMANAS YA SE CERRARON, dicho explícitamente.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 015_acuerdo_semanas.sql, 019_metering_backstops.sql.
-- Reentrante: se puede volver a aplicar sin romper nada.
--
-- Es la 023, del lado del cumplimiento. Misma forma, mismo motivo, mismo
-- pitfall — y por eso mismo se escribe aparte y no se mete en la 023: una es
-- del contador de facturación (`encuentros_metering`, período mensual) y la
-- otra del acuerdo de servicio (`acuerdo_semanas`, período semanal).
--
-- ── EL PROBLEMA: "CERRADA" SE INFERÍA DE LAS FILAS ───────────────────────────
-- Hasta acá, "¿esta semana está cerrada?" se contestaba buscando filas
-- `estado='cerrada'` en `acuerdo_semanas`. Para una semana con padrón es
-- exacto. Para una semana en la que el padrón está VACÍO —el piloto que todavía
-- no dio de alta a nadie, la instancia recién provisionada, una especialidad
-- que salió del config— no hay ninguna fila que escribir, y "cerrada en cero" y
-- "nunca se cerró" se ven exactamente igual. Ahí la diferencia importa:
--
--   · el barrido del cron la ve pendiente todos los días, para siempre — y como
--     toma las más viejas primero, esas semanas fantasma se comen la corrida y
--     tapan a las recientes, y
--   · el día que un profesional entra al padrón, esa semana vieja aparece
--     "abierta", el cierre la sella CON ÉL y la institución se encuentra con
--     cumplimiento sellado sobre una semana que ya había leído como en curso.
--
-- Es el mismo crítico del gate que la 023 cerró para el mes, por la puerta que
-- le quedaba abierta del lado semanal.
--
-- ── LA DECISIÓN ──────────────────────────────────────────────────────────────
-- Marca explícita. El cierre de una semana deja una fila acá, y a partir de ese
-- momento "cerrada" es un hecho registrado y no una inferencia sobre otra
-- tabla. Una semana marcada no vuelve al barrido ni con profesionales nuevos:
-- los que entraron después del cierre no se le agregan a un cumplimiento que la
-- institución ya leyó (misma regla que ya regía para las semanas con filas).
--
-- ── EL ORDEN IMPORTA, Y ES AL REVÉS DE LO QUE PARECE ─────────────────────────
-- Primero se SELLA y después se MARCA. Nunca al revés: el cumplimiento de una
-- semana cerrada se lee de las filas selladas, así que una semana marcada cuyas
-- filas no se escribieron mostraría CERO horas cumplidas teniendo actividad —
-- una semana en blanco para el cliente. Si el sello anda y la marca falla, en
-- cambio, no se pierde nada: la semana sigue cerrada por sus filas y la marca la
-- escribe el barrido de mañana.
--
-- La marca es INMUTABLE por el mismo motivo que el resto de esta familia: si se
-- pudiera borrar, "cerrada" volvería a ser una opinión.

CREATE TABLE IF NOT EXISTS acuerdo_semanas_cerradas (
  semana_ar DATE PRIMARY KEY,

  cerrada_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- La foto del cierre, para auditar después sin recalcular: cuántos
  -- profesionales tenía el universo de esa semana y cuántas filas se sellaron
  -- en esta corrida. Una semana cerrada sin padrón tiene los dos en 0, que es
  -- justamente el caso que esta tabla existe para poder afirmar.
  profesionales INTEGER NOT NULL DEFAULT 0,
  sellados INTEGER NOT NULL DEFAULT 0
);

-- Una semana cerrada no se reabre ni se borra. Mismo criterio que
-- `metering_periodos_cerrados` (023): un registro que se puede editar no
-- registra nada.
CREATE OR REPLACE FUNCTION acuerdo_semanas_cerradas_inmutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'acuerdo_semanas_cerradas: una semana cerrada no se reabre ni se borra. El cierre es la promesa de que el cumplimiento que la institución leyó el lunes va a decir lo mismo en diciembre; si hay algo mal adentro, se reabre la fila puntual de acuerdo_semanas (trigger de la 015), deliberadamente y dejando constancia.';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_acuerdo_semanas_cerradas_no_update ON acuerdo_semanas_cerradas;
CREATE TRIGGER trg_acuerdo_semanas_cerradas_no_update
  BEFORE UPDATE ON acuerdo_semanas_cerradas
  FOR EACH ROW EXECUTE FUNCTION acuerdo_semanas_cerradas_inmutable();

DROP TRIGGER IF EXISTS trg_acuerdo_semanas_cerradas_no_delete ON acuerdo_semanas_cerradas;
CREATE TRIGGER trg_acuerdo_semanas_cerradas_no_delete
  BEFORE DELETE ON acuerdo_semanas_cerradas
  FOR EACH ROW EXECUTE FUNCTION acuerdo_semanas_cerradas_inmutable();

-- TRUNCATE no dispara triggers de fila (hallazgo S3 de la 019): mismo cierre por
-- los dos lados, y usando la misma función de la 019.
REVOKE TRUNCATE ON acuerdo_semanas_cerradas FROM anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_acuerdo_semanas_cerradas_no_truncate ON acuerdo_semanas_cerradas;
CREATE TRIGGER trg_acuerdo_semanas_cerradas_no_truncate
  BEFORE TRUNCATE ON acuerdo_semanas_cerradas
  FOR EACH STATEMENT EXECUTE FUNCTION metering_no_truncate();

-- RLS activo SIN policies (patrón `acuerdo_semanas`): esto lo lee y lo escribe el
-- /admin interno de Docto con service role. La institución no cierra nada (R32)
-- y por lo tanto tampoco necesita ver esta tabla.
ALTER TABLE acuerdo_semanas_cerradas ENABLE ROW LEVEL SECURITY;
