-- Sprint cancelaciones y reprogramaciones

ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS turno_origen_id UUID REFERENCES public.turnos(id),
  ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT;

-- Tabla para mensajes automáticos del sistema (mensajería interna)
CREATE TABLE IF NOT EXISTS public.mensajes_sistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id UUID REFERENCES public.turnos(id),
  paciente_id UUID REFERENCES public.pacientes(id),
  medico_id UUID REFERENCES public.medicos(id),
  contenido TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.mensajes_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Paciente ve sus mensajes" ON public.mensajes_sistema
  FOR SELECT USING (paciente_id IN (
    SELECT id FROM public.pacientes WHERE user_id = auth.uid()
  ));

CREATE POLICY "Médico ve sus mensajes" ON public.mensajes_sistema
  FOR SELECT USING (medico_id IN (
    SELECT id FROM public.medicos WHERE user_id = auth.uid()
  ));
