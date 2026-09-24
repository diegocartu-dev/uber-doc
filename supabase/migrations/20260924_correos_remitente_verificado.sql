-- Que el asistente pueda responder solo, sin dejar abierto un relay (24/09/2026).
--
-- EL AGUJERO QUE ESTO CIERRA, y por qué existía el candado que ahora se abre:
-- el formulario público de /ayuda inserta una fila `entrada` con la dirección
-- que la persona TIPEA, sin comprobar que sea suya. Una fila `entrada`, por lo
-- tanto, no prueba que nadie nos escribió: cualquiera podía plantar una con el
-- mail de un tercero y hacer que Docto le mandara un correo.
--
-- Hasta hoy el bot lo resolvía pidiendo que una persona aprobara TODA respuesta
-- a un correo sin `resend_id`. Funcionaba, pero le pasaba la revisión a un
-- humano incluso cuando el sistema SÍ sabía quién había escrito: el formulario
-- ya resuelve la sesión y tiene el user_id — solo que lo escribía como texto en
-- el cuerpo ("Usuario: …") en vez de guardarlo como dato.
--
-- Con esta columna, el bot puede responderle solo a alguien que se autenticó, y
-- SIEMPRE al mail de su cuenta (no al que tipeó en el formulario). El relay
-- queda cerrado: nunca escribimos a una dirección que la persona no probó.
--
-- Los pedidos ANÓNIMOS siguen necesitando aprobación humana, y está bien: ahí
-- de verdad no sabemos de quién es esa dirección.
ALTER TABLE correos ADD COLUMN IF NOT EXISTS remitente_user_id uuid;

COMMENT ON COLUMN correos.remitente_user_id IS
  'Usuario autenticado que originó este correo desde /ayuda. Si está, la respuesta va al mail de SU cuenta, no al que tipeó. NULL = pedido anónimo o correo entrante real (ese se prueba por resend_id).';

-- Backfill: los pedidos del formulario ya traen el uuid en el cuerpo. Sin esto,
-- los que están esperando respuesta hoy seguirían pidiendo aprobación humana.
UPDATE correos
SET remitente_user_id = (substring(cuerpo_texto from 'Usuario: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'))::uuid
WHERE direccion = 'entrada'
  AND resend_id IS NULL
  AND remitente_user_id IS NULL
  AND cuerpo_texto ~ 'Usuario: [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
