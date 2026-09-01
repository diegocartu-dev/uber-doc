-- Una profesional registrada en Cirugía plástica pidió figurar TAMBIÉN en
-- Clínica médica, porque atiende dolencias comunes. `medicos.especialidad` es
-- una sola y así se queda: es la que agrupa en el tablero y en la oferta por
-- especialidad. Si un profesional tuviera N especialidades equivalentes, cada
-- reporte tendría que elegir por cuál contarlo y el mismo médico aparecería
-- sumado en dos columnas.
--
-- Las adicionales son DECLARATIVAS: hacen que aparezca cuando el paciente busca
-- esa especialidad y se muestran en su ficha. No cambian los conteos.
--
-- OJO con los grants (verificado en producción DESPUÉS de crearla, no supuesto):
-- la columna queda con UPDATE/INSERT/REFERENCES para `authenticated` —que son
-- de tabla— y SIN SELECT, porque en `medicos` el SELECT se otorga columna por
-- columna. Es el mismo estado que las columnas de PII.
--
-- Consecuencia práctica: NO puede entrar al SELECT que llena la clínica, que usa
-- el cliente RLS. Una sola columna sin SELECT hace fallar la query ENTERA y
-- PostgREST devuelve null en silencio (outage del 22/06). Se lee con service
-- role, en la query aparte que ya existía para `areas_atencion`.
ALTER TABLE medicos
  ADD COLUMN IF NOT EXISTS especialidades_adicionales JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN medicos.especialidades_adicionales IS
  'Especialidades declaradas ADEMÁS de `especialidad` (array JSON de strings del catálogo de lib/especialidades.ts). Sirven para buscar y mostrar; los reportes siguen agrupando por `especialidad`.';
