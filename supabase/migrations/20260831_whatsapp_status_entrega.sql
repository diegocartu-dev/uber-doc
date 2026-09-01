-- "Un aviso enviado no es un aviso recibido" (hallazgo 27/08): `resultado =
-- 'enviado'` significa que Twilio ACEPTÓ la llamada, no que llegó al celular.
-- El estado real de entrega nunca entraba a la base — se podía reconstruir
-- preguntándole a Twilio por SID (scripts/verify-avisos-whatsapp.ts), pero
-- ninguna pantalla ni experimento podía leerlo. Es prerequisito del piloto de
-- despertar oferta dormida: sin entrega medida, el experimento no se puede leer.
ALTER TABLE whatsapp_envios
  ADD COLUMN IF NOT EXISTS twilio_status TEXT,
  ADD COLUMN IF NOT EXISTS twilio_status_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS twilio_status_error TEXT;

COMMENT ON COLUMN whatsapp_envios.twilio_status IS
  'Último estado que reportó el StatusCallback de Twilio (queued/sent/delivered/read/failed/undelivered). NULL = el envío es anterior al webhook o el callback no llegó.';
