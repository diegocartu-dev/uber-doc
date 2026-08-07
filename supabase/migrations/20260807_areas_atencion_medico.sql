-- Áreas de atención adicionales del médico (decisión Diego 07/08/2026).
--
-- Origen: la Dra. Noelia Salva se registró en Pediatría y pidió figurar como
-- "Pediatra especialista en Adolescencia". Decisión de producto: NO es una
-- especialidad nueva de la lista (fragmentaría la búsqueda del paciente), es un
-- ÁREA ADICIONAL que el médico activa SOBRE su especialidad, con un rango de edad
-- que declara él mismo. Sirve para CUALQUIER especialidad, no solo pediatría.
--
-- El rango de edad es INFORMATIVO ("Atiende adolescentes (10 a 19 años)"), NO un
-- candado: no se bloquea ninguna reserva ni consulta por la edad del paciente.
--
-- ── Por qué una columna jsonb en `medicos` y no una tabla `medico_areas` ──
--   * El dato es chico (hoy 1 área por médico), se lee SIEMPRE junto al médico y
--     nunca se consulta solo → una tabla aparte sería un join extra en la clínica.
--   * Una tabla nueva sobre producción viva exige RLS + policies + grants propios
--     (más superficie para un error del tipo "clínica vacía").
--   * El repo ya modela listas por médico dentro de la propia fila
--     (`medicos.jurisdicciones text[]`, migración 20260702).
--   * jsonb (y no text[]) porque cada área lleva atributos propios (rango etario);
--     si mañana hay muchas áreas con más atributos, pasar a tabla es directo.
--
-- Forma del valor:
--   [{"area": "adolescencia", "edad_desde": 10, "edad_hasta": 19}]
-- Lista de áreas válidas y validación fina: src/lib/areas-atencion.ts

ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS areas_atencion jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backstop de forma a nivel DB: que nunca entre algo que no sea un array.
-- La validación fina (área conocida, enteros 0..120, desde < hasta) vive en el
-- servidor (src/lib/areas-atencion.ts → validarAreas), que es donde se le puede
-- dar al médico un mensaje claro.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'medicos_areas_atencion_es_array'
  ) THEN
    ALTER TABLE public.medicos
      ADD CONSTRAINT medicos_areas_atencion_es_array
      CHECK (jsonb_typeof(areas_atencion) = 'array');
  END IF;
END $$;

-- ── GRANTS DE COLUMNA (regla crítica del repo — outage del 22/06/2026) ──
-- Una columna nueva de `medicos` NO hereda los grants por-columna de la tabla. Si el
-- cliente del PACIENTE (rol authenticated) incluye esta columna en un SELECT sin este
-- GRANT, PostgREST falla la query ENTERA con "permission denied for column" y devuelve
-- null EN SILENCIO → la clínica se muestra VACÍA.
-- No es PII: es información pública del perfil profesional (qué edades atiende).
GRANT SELECT (areas_atencion) ON public.medicos TO authenticated, anon;

-- El médico edita su propia fila (RLS: auth.uid() = user_id). El endpoint hoy escribe
-- con service role, pero el grant deja la puerta abierta al cliente RLS sin sorpresas.
GRANT UPDATE (areas_atencion) ON public.medicos TO authenticated;
