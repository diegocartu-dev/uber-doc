-- ============================================
-- Migración 061: Sala de Espera — Entradas + Mensajes Internos
-- Sprint 2: tracking de tiempo de espera de pacientes
-- ============================================

-- 1. TABLA PRINCIPAL: sala_espera_entradas
CREATE TABLE IF NOT EXISTS public.sala_espera_entradas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id),
  medico_id UUID REFERENCES public.medicos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('ci', 'turno_programado', 'consultorio_particular')),
  consulta_id UUID REFERENCES public.consultas(id),
  turno_id UUID REFERENCES public.turnos(id),
  entrada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  salida_en TIMESTAMPTZ,
  motivo_salida TEXT CHECK (motivo_salida IN (
    'atendido',
    'cancelado_paciente',
    'cancelado_medico',
    'timeout_sistema',
    'cancelado_admin'
  )),
  cancelado_admin_id UUID REFERENCES public.admin_users(id),
  motivo_admin TEXT,

  -- XOR: exactamente una referencia (consulta o turno)
  CHECK ((consulta_id IS NOT NULL) != (turno_id IS NOT NULL)),
  -- salida_en y motivo_salida van juntos o ambos null
  CHECK (
    (salida_en IS NULL AND motivo_salida IS NULL) OR
    (salida_en IS NOT NULL AND motivo_salida IS NOT NULL)
  ),
  -- cancelado_admin requiere admin_id + motivo >= 10 chars
  CHECK (
    motivo_salida != 'cancelado_admin' OR
    (cancelado_admin_id IS NOT NULL AND motivo_admin IS NOT NULL AND LENGTH(motivo_admin) >= 10)
  )
);

CREATE INDEX idx_sala_paciente ON public.sala_espera_entradas(paciente_id);
CREATE INDEX idx_sala_medico ON public.sala_espera_entradas(medico_id);
CREATE INDEX idx_sala_activas ON public.sala_espera_entradas(entrada_en DESC) WHERE salida_en IS NULL;
CREATE INDEX idx_sala_salida ON public.sala_espera_entradas(salida_en DESC) WHERE salida_en IS NOT NULL;
CREATE INDEX idx_sala_consulta ON public.sala_espera_entradas(consulta_id) WHERE consulta_id IS NOT NULL;
CREATE INDEX idx_sala_turno ON public.sala_espera_entradas(turno_id) WHERE turno_id IS NOT NULL;

ALTER TABLE public.sala_espera_entradas ENABLE ROW LEVEL SECURITY;

-- RLS: paciente ve solo sus entradas
CREATE POLICY sala_paciente_read ON public.sala_espera_entradas
  FOR SELECT TO authenticated
  USING (
    paciente_id IN (SELECT id FROM public.pacientes WHERE user_id = auth.uid())
  );

-- RLS: médico ve entradas de pacientes que esperan por él
CREATE POLICY sala_medico_read ON public.sala_espera_entradas
  FOR SELECT TO authenticated
  USING (
    medico_id IN (SELECT id FROM public.medicos WHERE user_id = auth.uid())
  );

-- RLS: admin ve todo (SELECT, UPDATE para cancelar)
CREATE POLICY sala_admin_all ON public.sala_espera_entradas
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND activo = true)
  );

COMMENT ON TABLE public.sala_espera_entradas IS
'Registro de entradas a sala de espera virtual. Creación y cierre automáticos. Admin puede cancelar manualmente sin afectar la consulta asociada.';


-- 2. FUNCIONES HELPER (SECURITY DEFINER — server-side only)

-- Registrar entrada (idempotente para reconexiones)
CREATE OR REPLACE FUNCTION public.registrar_entrada_sala(
  p_paciente_id UUID,
  p_consulta_id UUID DEFAULT NULL,
  p_turno_id UUID DEFAULT NULL,
  p_medico_id UUID DEFAULT NULL,
  p_tipo TEXT DEFAULT 'ci'
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.sala_espera_entradas
  WHERE paciente_id = p_paciente_id
    AND salida_en IS NULL
    AND (
      (p_consulta_id IS NOT NULL AND consulta_id = p_consulta_id) OR
      (p_turno_id IS NOT NULL AND turno_id = p_turno_id)
    )
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.sala_espera_entradas (
    paciente_id, medico_id, tipo, consulta_id, turno_id
  ) VALUES (
    p_paciente_id, p_medico_id, p_tipo, p_consulta_id, p_turno_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cerrar entrada(s) por consulta o turno
CREATE OR REPLACE FUNCTION public.cerrar_entrada_sala(
  p_consulta_id UUID DEFAULT NULL,
  p_turno_id UUID DEFAULT NULL,
  p_motivo TEXT DEFAULT 'atendido'
)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.sala_espera_entradas
  SET salida_en = now(), motivo_salida = p_motivo
  WHERE salida_en IS NULL
    AND (
      (p_consulta_id IS NOT NULL AND consulta_id = p_consulta_id) OR
      (p_turno_id IS NOT NULL AND turno_id = p_turno_id)
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revocar EXECUTE de authenticated (solo callable desde service_role)
REVOKE EXECUTE ON FUNCTION public.registrar_entrada_sala FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.cerrar_entrada_sala FROM authenticated, anon, public;


-- 3. TABLA: mensajes_internos_medicos (persistent inbox for doctors)
CREATE TABLE IF NOT EXISTS public.mensajes_internos_medicos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  severidad TEXT NOT NULL DEFAULT 'info' CHECK (severidad IN ('info', 'media', 'alta')),
  leido BOOLEAN NOT NULL DEFAULT false,
  leido_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mensajes_medico ON public.mensajes_internos_medicos(medico_id);
CREATE INDEX idx_mensajes_no_leidos ON public.mensajes_internos_medicos(medico_id, created_at DESC) WHERE leido = false;

ALTER TABLE public.mensajes_internos_medicos ENABLE ROW LEVEL SECURITY;

-- Médico ve solo sus mensajes
CREATE POLICY mensajes_medico_read ON public.mensajes_internos_medicos
  FOR SELECT TO authenticated
  USING (
    medico_id IN (SELECT id FROM public.medicos WHERE user_id = auth.uid())
  );

-- Médico puede marcar como leído
CREATE POLICY mensajes_medico_update ON public.mensajes_internos_medicos
  FOR UPDATE TO authenticated
  USING (
    medico_id IN (SELECT id FROM public.medicos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    medico_id IN (SELECT id FROM public.medicos WHERE user_id = auth.uid())
  );

-- Admin ve todos
CREATE POLICY mensajes_admin_all ON public.mensajes_internos_medicos
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND activo = true)
  );

COMMENT ON TABLE public.mensajes_internos_medicos IS
'Mensajes internos persistentes para médicos. Push + inbox. Canal de comunicación interna de la plataforma.';
