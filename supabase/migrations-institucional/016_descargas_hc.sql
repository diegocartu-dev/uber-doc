-- 016_descargas_hc.sql — Quién se descargó qué historia clínica.
-- Migración SOLO de la instancia institucional. NUNCA corre en el B2C.
-- Requiere: 002_operadores.sql.
--
-- ── POR QUÉ SE REGISTRA ──────────────────────────────────────────────────────
-- La institución es RESPONSABLE de los datos de sus pacientes y Docto es
-- ENCARGADO de tratamiento (R27, art. 25 de la Ley 25.326). La historia
-- clínica que el panel deja bajar es el dato más sensible que produce la
-- plataforma, y el gate de rol ("es admin de la institución") dice que alguien
-- PUEDE bajarla, no QUIÉN la bajó. Sin este registro, ante un reclamo de un
-- paciente la única respuesta posible sería "no sabemos".
--
-- Append-only por diseño: se escribe y no se toca más. Es el equivalente
-- institucional de `asignaciones`, que hace lo mismo del lado del otorgador.

CREATE TABLE descargas_hc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operador_id UUID NOT NULL REFERENCES operadores(id),
  documento_id UUID NOT NULL REFERENCES documentos(id),
  -- Copia del contexto AL MOMENTO de la descarga: si mañana el documento se
  -- reasigna o el encuentro cambia, el registro sigue diciendo qué se bajó.
  tipo_encuentro TEXT CHECK (tipo_encuentro IN ('consulta','turno')),
  recurso_id UUID,
  paciente_id UUID,
  medico_id UUID,
  descargado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_descargas_hc_documento ON descargas_hc (documento_id, descargado_at DESC);
CREATE INDEX idx_descargas_hc_operador ON descargas_hc (operador_id, descargado_at DESC);

-- RLS activo SIN policies: solo service role. Ni siquiera el admin de la
-- institución lee esta tabla desde la app — es evidencia, no un tablero.
ALTER TABLE descargas_hc ENABLE ROW LEVEL SECURITY;
