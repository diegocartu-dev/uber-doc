-- Aviso por WhatsApp AL PACIENTE cuando el profesional acepta su consulta
-- inmediata (decisión Diego 10/09/2026, sobre el diagnóstico del 09/09: de 4
-- consultas aceptadas y nunca pagadas, en 3 el paciente ya no estaba en la sala
-- cuando el profesional aceptó; el mail agregado el 08/09 llegó en el mismo
-- segundo y no alcanzó).
--
-- `whatsapp_envios` nació para los avisos al médico y solo sabía de `medico_id`.
-- Los avisos al paciente van a la misma tabla —mismo transporte, mismo webhook
-- de entrega por `twilio_sid`— con el destinatario en `paciente_id`. En esas
-- filas `medico_id` queda NULL para no inflar los conteos de avisos al médico;
-- el profesional de la consulta se recupera por `consulta_id`.
--
-- Aditiva y nullable: no toca filas existentes ni el código que ya escribe acá.
ALTER TABLE whatsapp_envios
  ADD COLUMN IF NOT EXISTS paciente_id uuid REFERENCES pacientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whatsapp_envios_paciente_id_idx
  ON whatsapp_envios (paciente_id)
  WHERE paciente_id IS NOT NULL;
