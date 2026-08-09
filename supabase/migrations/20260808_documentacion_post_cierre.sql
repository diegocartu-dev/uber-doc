-- Documentación emitida DESPUÉS del cierre de la atención.
--
-- Contexto (auditoría 08/08/2026): cuatro caminos cierran una consulta sin que el
-- médico toque "Finalizar" (desconexión, sala de video vacía, cron nocturno de
-- huérfanas, backstop de rejoin). Ninguno mira el borrador. Resultado medido: hubo
-- atenciones pagadas donde el profesional escribió diagnóstico y evolución, el
-- sistema los guardó en el borrador, y el paciente no recibió nada.
--
-- Esta migración habilita el camino de reparación: el médico vuelve a la atención
-- ya cerrada y emite la documentación que faltó. Los documentos que salen por ese
-- camino se firman igual que todos los demás y llevan la fecha REAL de emisión
-- (created_at = hoy); estas columnas dejan constancia explícita de que la emisión
-- ocurrió después del cierre, para que nadie lea la fecha como una antedatación.
--
-- NO se aplica automáticamente. Ejecutar en el SQL Editor de Supabase ANTES de
-- mergear la rama (el código tiene fallback y no rompe si todavía no está, pero
-- entonces no queda la marca).

ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS emitido_post_cierre boolean NOT NULL DEFAULT false;

ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS emitido_post_cierre_at timestamptz;

COMMENT ON COLUMN public.documentos.emitido_post_cierre IS
  'true si el documento se emitió después de que la atención quedó cerrada (camino "completar documentación"). created_at sigue siendo la fecha REAL de emisión: acá nunca se antedata nada.';

COMMENT ON COLUMN public.documentos.emitido_post_cierre_at IS
  'Instante real en que el médico emitió el documento desde el camino de completar documentación. Redundante con created_at a propósito: sobrevive a cualquier backfill futuro.';

-- Auditoría: "¿qué se emitió fuera del cierre normal?" en una sola pasada.
CREATE INDEX IF NOT EXISTS idx_documentos_emitido_post_cierre
  ON public.documentos (medico_id, created_at DESC)
  WHERE emitido_post_cierre;
