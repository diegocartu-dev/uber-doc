-- Guardado de conversaciones con Nova.
--
-- POR QUÉ (decisión Diego, 10/08/2026): lo que un profesional le pide a la IA es
-- la lista de lo que le falta a la app, dicha con sus palabras. Hoy Nova no
-- guarda NADA: `nova_perfiles` se escribe una vez al abrirla y nunca más, así
-- que sabíamos quiénes la abrieron (10 de 37 aprobados reales) pero no cuántas
-- veces ni para qué. Esto lo convierte en fuente de producto.
--
-- QUÉ SE GUARDA: la conversación COMPLETA, tal cual, sin filtrar nada. Lo que un
-- profesional le pregunta a Nova —incluido el nombre de un paciente que pidió
-- turno— es dato que ya se ve en cualquier otra pantalla de /admin, igual que
-- los diagnósticos y las recetas emitidas. No se le pone una capa especial: la
-- distinción no existe en el producto (criterio de Diego, 10/08).
--
-- POR QUÉ IGUAL VA CERRADA (RLS activa sin policies + REVOKE): NO es por el
-- contenido, es por a quién le pertenece. Sin cierre, cualquier sesión
-- `authenticated` podría leer las conversaciones de OTRO profesional. `/admin`
-- lee todo sin restricción porque corre en el servidor con service_role, que no
-- se ve afectado por REVOKE. Mismo patrón que `notificaciones_medico`.
--
-- Se borra en cascada si se borra el médico.

-- ─── Conversación ────────────────────────────────────────────────────────────
-- Una fila por sesión de chat. El id lo genera el navegador al montar la
-- pantalla de Nova, así que dos pestañas son dos conversaciones — que es lo
-- correcto: son dos hilos distintos.
CREATE TABLE IF NOT EXISTS public.nova_conversaciones (
  id                    uuid PRIMARY KEY,
  -- medicos.id (la PK), NO auth.users.id. Se nombra explícito porque
  -- `nova_perfiles.medico_id` guarda el user_id y esa trampa ya hizo que un
  -- reporte diera "cero médicos usan Nova".
  medico_id             uuid NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  iniciada_at           timestamptz NOT NULL DEFAULT now()
);
-- Sin contadores a propósito: cuántos mensajes tuvo, cuándo fue el último y
-- cuántas acciones se confirmaron se cuentan sobre `nova_mensajes` al leer. Un
-- contador denormalizado hay que mantenerlo sincronizado desde el camino
-- caliente del chat, y a este volumen no compra nada — solo abre la puerta a
-- que el número mienta.

CREATE INDEX IF NOT EXISTS idx_nova_conv_medico ON public.nova_conversaciones (medico_id, iniciada_at DESC);
CREATE INDEX IF NOT EXISTS idx_nova_conv_fecha ON public.nova_conversaciones (iniciada_at DESC);

-- ─── Mensajes ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nova_mensajes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES public.nova_conversaciones(id) ON DELETE CASCADE,
  medico_id       uuid NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  rol             text NOT NULL CHECK (rol IN ('medico', 'nova')),
  contenido       text NOT NULL,
  -- Qué herramienta ejecutó Nova en ese turno (crear_disponibilidad,
  -- bloquear_periodo, …). NULL cuando solo respondió texto. Es lo que permite
  -- separar "preguntó" de "hizo".
  herramienta     text,
  -- Posición dentro de la conversación. Junto con el UNIQUE de abajo hace la
  -- captura idempotente: el frontend reenvía TODO el historial en cada request,
  -- y un reintento no puede duplicar turnos.
  orden           integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversacion_id, orden)
);

CREATE INDEX IF NOT EXISTS idx_nova_msg_conv ON public.nova_mensajes (conversacion_id, orden);
CREATE INDEX IF NOT EXISTS idx_nova_msg_medico ON public.nova_mensajes (medico_id, created_at DESC);
-- Para leer "qué le piden a Nova" sin traer las respuestas de Nova.
CREATE INDEX IF NOT EXISTS idx_nova_msg_pedidos ON public.nova_mensajes (created_at DESC) WHERE rol = 'medico';

-- ─── Cierre de acceso ────────────────────────────────────────────────────────
ALTER TABLE public.nova_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nova_mensajes ENABLE ROW LEVEL SECURITY;

-- Sin policies a propósito: con RLS activa y cero policies, `authenticated` y
-- `anon` no leen ni escriben nada. El REVOKE es el cinturón: sin él, un GRANT
-- por defecto del esquema podría dejar la tabla legible antes de que exista una
-- policy.
REVOKE ALL ON public.nova_conversaciones FROM anon, authenticated;
REVOKE ALL ON public.nova_mensajes FROM anon, authenticated;

COMMENT ON TABLE public.nova_conversaciones IS
  'Sesiones de chat con Nova. Dato sensible: puede contener información de pacientes. Solo service_role.';
COMMENT ON TABLE public.nova_mensajes IS
  'Turnos de las conversaciones con Nova. Dato sensible: puede contener información de pacientes. Solo service_role.';
