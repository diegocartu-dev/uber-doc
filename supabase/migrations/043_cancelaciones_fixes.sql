-- Fixes críticos para sprint cancelaciones (review Roberto)

-- 1. Actualizar CHECK constraint de reintegro_estado con nuevos valores
ALTER TABLE public.turnos DROP CONSTRAINT IF EXISTS turnos_reintegro_estado_check;
ALTER TABLE public.turnos ADD CONSTRAINT turnos_reintegro_estado_check
  CHECK (reintegro_estado IN ('pendiente', 'usado_reprogramacion', 'reembolsado'));

-- 2. Agregar updated_at a turnos para calcular vencimiento de crédito (45 días)
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS turnos_updated_at ON public.turnos;
CREATE TRIGGER turnos_updated_at
  BEFORE UPDATE ON public.turnos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. RPC atómica para reprogramar turno (transacción SQL, no dos UPDATEs separados)
CREATE OR REPLACE FUNCTION public.reprogramar_turno_atomico(
  p_turno_origen_id UUID,
  p_nuevo_turno_id UUID,
  p_paciente_id UUID
) RETURNS TEXT AS $$
DECLARE
  v_origen RECORD;
  v_reservado INT;
  v_credito INT;
BEGIN
  -- Lock + verificar turno origen
  SELECT id, paciente_id, medico_id, reintegro_estado, reprogramaciones, updated_at
    INTO v_origen
    FROM public.turnos
    WHERE id = p_turno_origen_id
    FOR UPDATE;

  IF NOT FOUND THEN RETURN 'Turno original no encontrado.'; END IF;
  IF v_origen.paciente_id != p_paciente_id THEN RETURN 'No te pertenece.'; END IF;
  IF v_origen.reintegro_estado != 'pendiente' THEN RETURN 'Sin crédito disponible.'; END IF;
  IF COALESCE(v_origen.reprogramaciones, 0) >= 2 THEN RETURN 'Máximo 2 reprogramaciones alcanzado.'; END IF;

  -- Verificar vencimiento (45 días desde updated_at)
  IF now() > v_origen.updated_at + INTERVAL '45 days' THEN
    RETURN 'El crédito venció. Se procesará tu reembolso automáticamente.';
  END IF;

  -- Verificar que el nuevo turno sea del mismo médico y esté disponible
  PERFORM 1 FROM public.turnos
    WHERE id = p_nuevo_turno_id
      AND estado = 'disponible'
      AND medico_id = v_origen.medico_id;

  IF NOT FOUND THEN RETURN 'Turno no disponible o de otro médico.'; END IF;

  -- Reservar nuevo turno (optimistic lock en estado)
  UPDATE public.turnos SET
    estado = 'confirmado',
    paciente_id = p_paciente_id,
    turno_origen_id = p_turno_origen_id
  WHERE id = p_nuevo_turno_id AND estado = 'disponible';

  GET DIAGNOSTICS v_reservado = ROW_COUNT;
  IF v_reservado = 0 THEN RETURN 'Este turno ya fue tomado por otro paciente.'; END IF;

  -- Marcar crédito como usado + incrementar contador en origen
  UPDATE public.turnos SET
    reintegro_estado = 'usado_reprogramacion',
    reprogramaciones = COALESCE(reprogramaciones, 0) + 1
  WHERE id = p_turno_origen_id AND reintegro_estado = 'pendiente';

  GET DIAGNOSTICS v_credito = ROW_COUNT;
  IF v_credito = 0 THEN
    -- Rollback: devolver turno nuevo a disponible
    UPDATE public.turnos SET
      estado = 'disponible', paciente_id = NULL, turno_origen_id = NULL
    WHERE id = p_nuevo_turno_id;
    RETURN 'El crédito ya fue utilizado.';
  END IF;

  RETURN 'ok';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
