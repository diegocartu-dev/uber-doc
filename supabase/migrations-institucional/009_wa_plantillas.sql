-- 009_wa_plantillas.sql — Plantillas WhatsApp de la instancia (spec §8.2).
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
--
-- Los ContentSid de Twilio son IDs de plantilla, NO secretos (mismo criterio
-- que las constantes PLANTILLA_* de src/lib/whatsapp.ts). Van en el CONFIG y
-- no hardcodeados en código porque son POR INSTANCIA (marca blanca: otra
-- institución puede tener su propio sender y su propio juego de plantillas).
--
-- Los defaults son las 7 plantillas cargadas en Twilio el 12/08/2026
-- (registro completo: docto-institucional/etapa0/plantillas-whatsapp.md;
-- estado de aprobación de Meta pendiente — mientras no estén approved, el
-- envío cae al fallback de mail y el flag `whatsapp_institucional` de
-- feature_flags mantiene el canal apagado).
--
-- SIN GRANT a authenticated (la migración 001 grantea columna por columna y
-- esta no se suma): la leen solo los módulos server vía service role.

ALTER TABLE institucion_config
  ADD COLUMN IF NOT EXISTS wa_plantillas jsonb NOT NULL DEFAULT '{
    "turno_asignado":          "HXbada2924fd1ada7a8475143095489565",
    "recordatorio":            "HXcef71cd3d8f45bf6d55a4884874d05f7",
    "reprogramacion":          "HX756cdbc63a63ea6d27a852be55433eef",
    "ci_asignada":             "HX72b401573be3156ac2805b473b7d9c07",
    "turno_acordado_asignado": "HX194f54fc8379d9b01a50e392285a8b6b",
    "ci_asignada_medico":      "HX85a7edadfed2f3fc47aed81081132f69",
    "reprogramacion_medico":   "HX568c48bba5dbcdd98143809350a87dea"
  }'::jsonb;
