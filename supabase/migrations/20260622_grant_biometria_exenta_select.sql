-- 20260622_grant_biometria_exenta_select.sql
-- HOTFIX de outage: la columna `biometria_exenta` (creada en 20260620_biometria_exenta)
-- quedó SIN SELECT para authenticated/anon (el default restrictivo de columnas nuevas
-- en `medicos`). El gate de identidad filtra el listado de la clínica con
--   .or("identidad_validada.eq.true,biometria_exenta.eq.true,es_cuenta_test.eq.true")
-- usando el cliente del PACIENTE (authenticated). Sin SELECT en `biometria_exenta`,
-- ese filtro daba "permission denied for table medicos" → el listado volvía vacío →
-- ningún médico reservable mientras `identidad_gate_activa` estuviera ON.
--
-- Fix: dar SELECT en la columna, igual que `identidad_validada` y `es_cuenta_test`
-- (es un booleano de estado, no expone PII). Aplicado en prod el 22/06/2026.
--
-- LECCIÓN: toda columna nueva de `medicos` que se use en un filtro del cliente del
-- paciente necesita GRANT SELECT explícito.

GRANT SELECT (biometria_exenta) ON public.medicos TO authenticated, anon;
