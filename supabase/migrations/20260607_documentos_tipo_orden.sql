-- ============================================================================
-- Documentos — nuevo tipo 'orden' (orden médica: RX, laboratorio, derivaciones)
-- Fecha: 2026-06-07
-- Sprint: Workspace HC + Orden
-- ============================================================================
-- CONTEXTO: el workspace del médico suma un campo "Orden médica" (pedidos de
-- estudios, laboratorio, derivaciones). Se persiste como un documento más, con
-- el mismo comportamiento de texto plano que 'certificado': se renderiza en el
-- PDF como texto libre, se lista en la grilla de documentos del paciente y del
-- médico, y se muestra en la pantalla de cierre de la sala.
--
-- La 'orden' NO forma parte de la evolución clínica ni de la Historia Clínica:
-- es un pedido administrativo/operativo, no una nota de evolución. Por eso solo
-- amplía el universo de tipos de `documentos`, sin tocar la lógica de evolución.
--
-- El CHECK original (014_documentos.sql) es inline sobre la columna `tipo`, así
-- que Postgres lo nombró `documentos_tipo_check`. Lo reemplazamos por uno
-- equivalente que agrega 'orden' al conjunto permitido.
--
-- Idempotente: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT con el set ampliado.
--
-- NO APLICADA TODAVÍA. La aplica Diego manualmente (regla CLAUDE.md: las
-- migraciones requieren OK explícito antes de ejecutar el DDL).
-- ============================================================================

BEGIN;

ALTER TABLE public.documentos
  DROP CONSTRAINT IF EXISTS documentos_tipo_check;

ALTER TABLE public.documentos
  ADD CONSTRAINT documentos_tipo_check
  CHECK (tipo IN ('receta', 'indicaciones', 'certificado', 'orden'));

COMMIT;

-- Rollback:
--   ALTER TABLE public.documentos
--     DROP CONSTRAINT IF EXISTS documentos_tipo_check;
--   ALTER TABLE public.documentos
--     ADD CONSTRAINT documentos_tipo_check
--     CHECK (tipo IN ('receta', 'indicaciones', 'certificado'));
