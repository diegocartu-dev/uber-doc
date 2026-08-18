-- 029_demo_token_recuperable.sql — El QR de una demo se puede volver a mostrar.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 004_accesos_link.sql, 025_demo_sesiones.sql.
--
-- ── QUÉ PROBLEMA RESUELVE ────────────────────────────────────────────────────
-- `accesos_link` guarda el HASH del token y nunca el token. Es la decisión
-- correcta para el enlace que se le manda a un paciente real por WhatsApp: si
-- alguien se lleva la base, se lleva huellas y no llaves.
--
-- Pero para la demo esa misma decisión producía una pantalla imposible de usar.
-- El enlace existía en un solo instante —la respuesta que lo creó— y de la base
-- no se podía recuperar. Recargar la pantalla lo perdía. La única salida era
-- "Regenerar", que emite otro y DEJA AFUERA a quien ya había entrado. De ahí
-- salieron el botón rojo, el diálogo de seis renglones explicando el riesgo, y
-- un operador —Diego— teniendo que entender el modelo de tokens para invitar a
-- alguien a una reunión.
--
-- ── POR QUÉ ACÁ SÍ SE PUEDE GUARDAR EL TOKEN ─────────────────────────────────
-- Lo que protege el hash es el enlace de un PACIENTE REAL: su turno, su historia
-- clínica, su receta. Un enlace de demostración abre una cuenta de utilería,
-- creada para una reunión, con pacientes inventados, y que se borra entera al
-- terminar. No hay nada detrás que el hash esté protegiendo — solo estaba
-- complicando a quien arma la demo.
--
-- Por eso la columna es NULL para todo el resto y solo se llena cuando la fila
-- es de demostración. El `CHECK` lo vuelve estructural: no depende de que el
-- código se acuerde. Si mañana alguien intenta guardar el token de un paciente
-- real, la base lo rechaza.
--
-- ── LO QUE ESTA MIGRACIÓN NO CAMBIA ──────────────────────────────────────────
-- `token_hash` sigue siendo lo que se valida al entrar. Esta columna es para
-- volver a DIBUJAR el QR, no para autenticar: la puerta sigue siendo la misma.

ALTER TABLE accesos_link
  ADD COLUMN IF NOT EXISTS token_demo TEXT;

COMMENT ON COLUMN accesos_link.token_demo IS
  'Token en claro, SOLO para filas de demostración (es_demo = true): permite volver a mostrar el QR las veces que haga falta. NULL siempre para accesos de pacientes reales — lo garantiza accesos_link_token_demo_solo_demo.';

-- El cinturón: token en claro únicamente donde es_demo.
ALTER TABLE accesos_link
  DROP CONSTRAINT IF EXISTS accesos_link_token_demo_solo_demo;

ALTER TABLE accesos_link
  ADD CONSTRAINT accesos_link_token_demo_solo_demo
  CHECK (token_demo IS NULL OR es_demo = true);

-- No se expone a nadie por la vía pública: se lee con service role desde el
-- panel de la demo, que ya está detrás del guard de admin.
REVOKE SELECT (token_demo) ON accesos_link FROM anon, authenticated;
