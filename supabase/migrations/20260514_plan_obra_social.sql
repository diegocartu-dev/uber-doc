-- Agrega campo plan_obra_social a pacientes
-- Separación OOSS / Plan para receta ReNaPDiS
-- Decreto 63/2024 requiere que la receta muestre
-- OOSS y Plan como campos distintos

ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS plan_obra_social TEXT;

COMMENT ON COLUMN pacientes.plan_obra_social IS
'Plan/cobertura de la obra social (ej: Plan 210, PMO, Plan Familiar).
Separado de obra_social que guarda el nombre de la entidad (ej: OSDE, Swiss Medical).
Requerido por Decreto 63/2024 para recetas.';
