-- Módulo de Turnos Programados

-- Modelos de agenda del médico
CREATE TABLE IF NOT EXISTS public.agenda_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id uuid REFERENCES public.medicos(id) ON DELETE CASCADE NOT NULL,
  nombre text NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  activo boolean DEFAULT true,
  prioridad integer DEFAULT 1,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Franjas horarias por día dentro de cada modelo
CREATE TABLE IF NOT EXISTS public.agenda_franjas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid REFERENCES public.agenda_modelos(id) ON DELETE CASCADE NOT NULL,
  dia_semana integer NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL
);

-- Turnos generados
CREATE TABLE IF NOT EXISTS public.turnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id uuid REFERENCES public.medicos(id) NOT NULL,
  paciente_id uuid REFERENCES public.pacientes(id),
  modelo_id uuid REFERENCES public.agenda_modelos(id),
  fecha date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  estado text DEFAULT 'disponible' CHECK (estado IN ('disponible', 'reservado', 'cancelado', 'completado')),
  monto integer,
  pago_id text,
  recordatorios jsonb DEFAULT '{"cuando":"todos","canal":"ambos"}',
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Lista de espera
CREATE TABLE IF NOT EXISTS public.turnos_espera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid REFERENCES public.turnos(id) ON DELETE CASCADE NOT NULL,
  paciente_id uuid REFERENCES public.pacientes(id) NOT NULL,
  posicion integer NOT NULL,
  notificado_at timestamptz,
  expira_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.agenda_modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_franjas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos_espera ENABLE ROW LEVEL SECURITY;

-- Políticas: agenda_modelos
CREATE POLICY "Médicos ven sus modelos de agenda"
  ON public.agenda_modelos FOR SELECT TO authenticated
  USING (medico_id IN (SELECT id FROM public.medicos WHERE user_id = auth.uid()));

CREATE POLICY "Médicos crean sus modelos de agenda"
  ON public.agenda_modelos FOR INSERT TO authenticated
  WITH CHECK (medico_id IN (SELECT id FROM public.medicos WHERE user_id = auth.uid()));

CREATE POLICY "Médicos actualizan sus modelos de agenda"
  ON public.agenda_modelos FOR UPDATE TO authenticated
  USING (medico_id IN (SELECT id FROM public.medicos WHERE user_id = auth.uid()));

CREATE POLICY "Médicos eliminan sus modelos de agenda"
  ON public.agenda_modelos FOR DELETE TO authenticated
  USING (medico_id IN (SELECT id FROM public.medicos WHERE user_id = auth.uid()));

-- Políticas: agenda_franjas (acceso via modelo)
CREATE POLICY "Médicos ven franjas de sus modelos"
  ON public.agenda_franjas FOR SELECT TO authenticated
  USING (modelo_id IN (
    SELECT id FROM public.agenda_modelos WHERE medico_id IN (
      SELECT id FROM public.medicos WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Médicos crean franjas en sus modelos"
  ON public.agenda_franjas FOR INSERT TO authenticated
  WITH CHECK (modelo_id IN (
    SELECT id FROM public.agenda_modelos WHERE medico_id IN (
      SELECT id FROM public.medicos WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Médicos eliminan franjas de sus modelos"
  ON public.agenda_franjas FOR DELETE TO authenticated
  USING (modelo_id IN (
    SELECT id FROM public.agenda_modelos WHERE medico_id IN (
      SELECT id FROM public.medicos WHERE user_id = auth.uid()
    )
  ));

-- Políticas: turnos
CREATE POLICY "Médicos ven sus turnos"
  ON public.turnos FOR SELECT TO authenticated
  USING (medico_id IN (SELECT id FROM public.medicos WHERE user_id = auth.uid()));

CREATE POLICY "Pacientes ven turnos disponibles y propios"
  ON public.turnos FOR SELECT TO authenticated
  USING (
    estado = 'disponible'
    OR paciente_id IN (SELECT id FROM public.pacientes WHERE user_id = auth.uid())
  );

CREATE POLICY "Médicos crean turnos"
  ON public.turnos FOR INSERT TO authenticated
  WITH CHECK (medico_id IN (SELECT id FROM public.medicos WHERE user_id = auth.uid()));

CREATE POLICY "Médicos actualizan sus turnos"
  ON public.turnos FOR UPDATE TO authenticated
  USING (medico_id IN (SELECT id FROM public.medicos WHERE user_id = auth.uid()));

CREATE POLICY "Pacientes reservan turnos disponibles"
  ON public.turnos FOR UPDATE TO authenticated
  USING (estado = 'disponible');

-- Políticas: turnos_espera
CREATE POLICY "Pacientes ven su posición en espera"
  ON public.turnos_espera FOR SELECT TO authenticated
  USING (paciente_id IN (SELECT id FROM public.pacientes WHERE user_id = auth.uid()));

CREATE POLICY "Pacientes se anotan en lista de espera"
  ON public.turnos_espera FOR INSERT TO authenticated
  WITH CHECK (paciente_id IN (SELECT id FROM public.pacientes WHERE user_id = auth.uid()));

CREATE POLICY "Médicos ven lista de espera de sus turnos"
  ON public.turnos_espera FOR SELECT TO authenticated
  USING (turno_id IN (
    SELECT id FROM public.turnos WHERE medico_id IN (
      SELECT id FROM public.medicos WHERE user_id = auth.uid()
    )
  ));
