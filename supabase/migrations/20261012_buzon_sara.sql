-- Buzón de Sara en la Bandeja (pedido de AC Ai, decidido por Diego 12/10/2026).
--
-- Sara (la secretaria de pacientes que atiende AC Ai) deja en el panel los
-- contactos que tiene que seguir una persona: una institución interesada o un
-- profesional que el registro web todavía no admite. NO son mails: van en una
-- pestaña propia de la Bandeja, separada de soporte, y el asistente de la
-- bandeja (Grokbot) no los ve.
--
-- Viven en la misma tabla que el correo, marcados por `origen`, para que el día
-- que un solo agente atienda todo, unificar sea sacar un filtro y no mover datos.
--
-- Se aplica en LAS DOS bases: la página de la Bandeja existe también en la
-- instancia institucional y lee estas columnas. La puerta de Sara solo existe en
-- el B2C (la instancia responde 404), así que allá `claves_externas` queda vacía.

ALTER TABLE correos
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'correo'
    CONSTRAINT correos_origen_valido CHECK (origen IN ('correo', 'sara')),
  -- Lo que mandó Sara, ya validado: tipo, nombre, institución o profesión,
  -- mail, teléfono, interés, aceptación y cuándo lo recibió ella.
  ADD COLUMN IF NOT EXISTS datos jsonb,
  -- El id que Sara le pone al contacto. Si reintenta el envío, no se duplica.
  ADD COLUMN IF NOT EXISTS id_externo text;

CREATE UNIQUE INDEX IF NOT EXISTS correos_origen_id_externo_unico
  ON correos (origen, id_externo) WHERE id_externo IS NOT NULL;

-- Claves de los sistemas de afuera que escriben en la Bandeja. Se guarda SOLO el
-- sha256 de la clave: la clave pelada se entrega una vez y no se puede recuperar.
-- Rotar = insertar una nueva y poner `activa = false` en la vieja.
CREATE TABLE IF NOT EXISTS claves_externas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  quien text NOT NULL CONSTRAINT claves_externas_quien_valido CHECK (quien IN ('sara')),
  key_hash text NOT NULL UNIQUE,
  activa boolean NOT NULL DEFAULT true
);

-- Solo el servidor (service role) la toca: RLS activado SIN políticas.
ALTER TABLE claves_externas ENABLE ROW LEVEL SECURITY;
