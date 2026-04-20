-- Web Push: tabla de suscripciones para notificaciones push
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol TEXT CHECK (rol IN ('medico', 'paciente')),
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: cada usuario solo ve y modifica sus propias suscripciones
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus propias suscripciones push"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuarios crean sus propias suscripciones push"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios actualizan sus propias suscripciones push"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuarios eliminan sus propias suscripciones push"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Índice para buscar suscripción activa por user_id
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_activa
  ON public.push_subscriptions (user_id, activa) WHERE activa = true;

NOTIFY pgrst, 'reload schema';
