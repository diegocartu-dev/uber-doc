-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ ORDEN DE DESPLIEGUE: ESTA MIGRACIÓN VA **ANTES** DEL DEPLOY DEL CÓDIGO.
--
-- El rescate del borrador emite documentos y los sella con un método de
-- atribución nuevo ('rescate_borrador'). Si el código sale primero, el CHECK
-- vigente de `firma_logs.metodo_atribucion` rechaza la fila, el sellado se
-- revierte por diseño y los documentos rescatados llegan al paciente SIN sello
-- (con la leyenda ámbar "Documento sin sello electrónico de verificación").
--
-- Llegan igual —que es lo que importa— pero sin sello. El mail de alerta del
-- rescate lo dice con todas las letras cuando pasa, y el cron
-- `documentos-sin-sello` avisa dentro de la hora.
--
-- Es segura de aplicar sobre el código VIEJO: solo ensancha un CHECK y agrega
-- dos columnas nullable. Nada de lo que hoy corre se rompe.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- Rescate del borrador en los cierres automáticos
-- Auditoría 08/08/2026 — "lo que el médico ya escribió tiene que llegar al paciente".
--
-- CONTEXTO: Docto autoguarda cada 5 s lo que el profesional escribe durante la
-- consulta (`consultas.doc_borrador` / `turnos.doc_borrador`), pero ese borrador
-- era una libreta privada: ninguna línea de código lo convertía en documentos
-- entregados. Cuando la consulta se cerraba SIN que el profesional tocara
-- "Finalizar" —desconexión, sala de video vacía, cron nocturno, backstop de
-- rejoin— el paciente no recibía nada y nadie se enteraba.
--
-- A partir de ahora esos cuatro caminos emiten lo que el profesional dejó
-- escrito y lo sellan. Como el acto de cierre NO lo hizo el profesional, la
-- atribución se registra con su nombre real: 'rescate_borrador'.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Método de atribución nuevo ───────────────────────────────────────────
-- Qué dice el valor: el contenido lo redactó el profesional desde su sesión
-- autenticada (el autoguardado del borrador lo verificó en cada PATCH), pero el
-- acto de emisión lo disparó la plataforma al cerrar la consulta. No es
-- 'sesion_medico' (no hubo click en "Finalizar") ni 'sellado_diferido_plataforma'
-- (no es un documento histórico: se emite y se sella en el mismo instante).
ALTER TABLE public.firma_logs
  DROP CONSTRAINT IF EXISTS firma_logs_metodo_atribucion_check;
ALTER TABLE public.firma_logs
  ADD CONSTRAINT firma_logs_metodo_atribucion_check
  CHECK (metodo_atribucion IN (
    'otp',
    'sesion_medico',
    'sellado_diferido_plataforma',
    'rescate_borrador'
  )) NOT VALID;

-- ─── 2. Coherencia del rescate ───────────────────────────────────────────────
-- Sin OTP (no hubo request del profesional) y con el contexto declarando las dos
-- cosas que hacen honesto al registro: que la emisión fue automática y por qué
-- camino se cerró la consulta. Un log de rescate que no diga eso deja creer que
-- el profesional cerró y firmó, que es exactamente lo que no pasó.
ALTER TABLE public.firma_logs
  DROP CONSTRAINT IF EXISTS firma_logs_rescate_borrador_check;
ALTER TABLE public.firma_logs
  ADD CONSTRAINT firma_logs_rescate_borrador_check
  CHECK (
    metodo_atribucion <> 'rescate_borrador' OR (
      otp_id IS NULL
      AND contexto->>'rescate_automatico' = 'true'
      AND contexto ? 'cierre_origen'
    )
  ) NOT VALID;

COMMENT ON COLUMN public.firma_logs.metodo_atribucion IS
  '"otp" = segundo factor por mail; "sesion_medico" = sesión autenticada del médico al finalizar la consulta (art. 5 Ley 25.506); "sellado_diferido_plataforma" = sello posterior sobre documentos históricos; "rescate_borrador" = la plataforma emitió y selló lo que el médico había dejado escrito, en un cierre automático que él no disparó.';

-- ─── 3. Registro del rescate en la consulta / el turno ───────────────────────
-- Para poder distinguir después, sin adivinar, qué encuentros pasaron por el
-- rescate: cuándo, por qué camino se cerraron, qué se emitió, qué quedó
-- pendiente de revisión humana. Es el insumo del seguimiento y de cualquier
-- auditoría posterior.
--
-- Nullable y sin default: las filas viejas quedan en NULL, que es la verdad
-- (no pasaron por el rescate porque el rescate no existía).
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS rescate_borrador jsonb;
ALTER TABLE public.turnos    ADD COLUMN IF NOT EXISTS rescate_borrador jsonb;

COMMENT ON COLUMN public.consultas.rescate_borrador IS
  'Resultado del rescate del borrador cuando la consulta se cerró sin que el médico tocara "Finalizar". NULL = no pasó por el rescate. Ver src/lib/consultas/cerrar-con-rescate.ts.';
COMMENT ON COLUMN public.turnos.rescate_borrador IS
  'Resultado del rescate del borrador cuando el turno se cerró sin que el médico tocara "Finalizar". NULL = no pasó por el rescate. Ver src/lib/consultas/cerrar-con-rescate.ts.';

-- Índice parcial: las consultas rescatadas son un puñado; el índice sirve para
-- listarlas rápido en el seguimiento sin escanear toda la tabla.
CREATE INDEX IF NOT EXISTS idx_consultas_rescate_borrador
  ON public.consultas ((rescate_borrador->>'resultado'))
  WHERE rescate_borrador IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_turnos_rescate_borrador
  ON public.turnos ((rescate_borrador->>'resultado'))
  WHERE rescate_borrador IS NOT NULL;

-- ─── ROLLBACK (solo si hace falta revertir) ──────────────────────────────────
--   DROP INDEX IF EXISTS public.idx_consultas_rescate_borrador;
--   DROP INDEX IF EXISTS public.idx_turnos_rescate_borrador;
--   ALTER TABLE public.consultas DROP COLUMN IF EXISTS rescate_borrador;
--   ALTER TABLE public.turnos    DROP COLUMN IF EXISTS rescate_borrador;
--   ALTER TABLE public.firma_logs DROP CONSTRAINT IF EXISTS firma_logs_rescate_borrador_check;
--   -- (el CHECK de metodo_atribucion se deja ensanchado: revertirlo rompería
--   --  los logs de rescate ya escritos, que son append-only.)
