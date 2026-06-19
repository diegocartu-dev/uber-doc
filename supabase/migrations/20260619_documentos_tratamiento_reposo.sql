-- Documentos médicos legales — campos para el certificado de reposo laboral.
-- Aplicada en producción vía Supabase Management API el 2026-06-19.
-- Marco: art. 210 LCT (Ley 27.802 + Decreto 407/2026).
--
-- tratamiento: bloque "Tratamiento" del certificado. Se prefilla desde las
--   Indicaciones médicas que el médico ya carga (editable).
-- dias_reposo: cantidad de días de reposo laboral. Campo ESTRUCTURADO (no texto
--   libre) por ser el dato con efecto jurídico directo que justifica la inasistencia.
ALTER TABLE documentos
  ADD COLUMN IF NOT EXISTS tratamiento TEXT,
  ADD COLUMN IF NOT EXISTS dias_reposo INTEGER;
