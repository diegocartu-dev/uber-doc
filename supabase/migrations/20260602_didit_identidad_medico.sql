-- ─────────────────────────────────────────────────────────────────────────────
-- Validación de identidad biométrica del médico (Didit + RENAPER)
-- Cierra el riesgo de suplantación: DNI/CUIT/matrícula son públicos (están en
-- cualquier receta), así que validamos que la persona ES el titular real.
--
-- Docto NO almacena biometría (selfie, liveness, template facial). Eso lo
-- procesa Didit. Acá guardamos SOLO el resultado de la validación.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE medicos
  -- true cuando Didit aprobó la verificación Y cruzamos DNI↔matrícula (REFEPS)
  ADD COLUMN IF NOT EXISTS identidad_validada BOOLEAN NOT NULL DEFAULT false,
  -- cuándo se validó (para auditoría)
  ADD COLUMN IF NOT EXISTS identidad_validada_at TIMESTAMPTZ,
  -- id de la sesión de Didit (vincula con su panel para auditoría/soporte)
  ADD COLUMN IF NOT EXISTS didit_session_id TEXT,
  -- último estado conocido de la sesión Didit
  -- (Not Started / In Progress / In Review / Approved / Declined / ...)
  ADD COLUMN IF NOT EXISTS didit_status TEXT;

-- Índice para que el webhook resuelva rápido la sesión → médico
CREATE INDEX IF NOT EXISTS idx_medicos_didit_session_id
  ON medicos (didit_session_id)
  WHERE didit_session_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- GRANDFATHER (DECISIÓN DE DIEGO, 02/06/2026):
-- Solo las CUENTAS DE PRUEBA quedan validadas, para poder seguir testeando sin
-- fricción. Los médicos reales (incl. Sofía Fasce) NO se grandfather: pasan por
-- Didit cuando entremos a producción. Sofía Fasce será la consulta de prueba
-- real, y recién ahí queda validada.
UPDATE medicos
  SET identidad_validada = true, identidad_validada_at = now()
  WHERE es_cuenta_test = true;
-- ─────────────────────────────────────────────────────────────────────────────
