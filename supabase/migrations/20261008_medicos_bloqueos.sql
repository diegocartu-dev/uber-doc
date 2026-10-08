-- APLICADA en producción el 08/10/2026 (OK de Diego), verificada (RLS activa, sin
-- acceso para anon/authenticated, índice creado). Solo en la base principal (el
-- bloqueo vive en el B2C; la instancia institucional no lo usa).
--
-- Un profesional que no está en condiciones de atender no atiende ni oferta
-- (Diego, 08/10/2026). Primer caso: WhatsApp rechaza su número (error 63024 de
-- Twilio, "destinatario inválido": no tiene WhatsApp activo) y entonces no se
-- entera de los pacientes que lo esperan. Caso real del 05/10: el paciente
-- esperó y el profesional nunca recibió un solo aviso.
--
-- El bloqueo usa las columnas de visibilidad que ya existen (oculto_clinica,
-- visible_consultorio_particular, disponible) y guarda acá el motivo y los
-- valores previos, para devolverlos tal cual al levantarlo. Así no se agrega
-- ninguna columna a la búsqueda de la clínica (la trampa de los grants).
-- Solo el servidor (service role) lee y escribe esta tabla.
CREATE TABLE IF NOT EXISTS public.medicos_bloqueos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id uuid NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('whatsapp')),
  motivo text NOT NULL,
  codigo text,
  previo jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_at timestamptz NOT NULL DEFAULT now(),
  levantado_at timestamptz,
  levantado_por text
);
-- Un solo bloqueo activo por profesional y tipo.
CREATE UNIQUE INDEX IF NOT EXISTS medicos_bloqueos_uno_activo
  ON public.medicos_bloqueos (medico_id, tipo) WHERE levantado_at IS NULL;
ALTER TABLE public.medicos_bloqueos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.medicos_bloqueos FROM anon, authenticated;
