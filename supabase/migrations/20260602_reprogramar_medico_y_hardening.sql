-- ============================================================================
-- Nova v2 — Sprint de DB (02/06/2026)
-- Destraba reprogramar_turno (Bloque 2) + hardening de la auditoría de Roberto.
--
-- 4 partes:
--   1) RPC dedicado de reprogramación INICIADA POR EL MÉDICO (mueve turno activo).
--   2) Fix del RPC del PACIENTE (CRÍTICO-1: el origen quedaba 'confirmado').
--   3) REVOKE EXECUTE de los RPC a anon/authenticated (superficie de seguridad).
--   4) CHECK defensivo turnos.monto >= 0 (red del precio que provee el LLM).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1) RPC: reprogramar_turno_medico
--    Mueve el turno ACTIVO de un paciente a un slot disponible, SIN las reglas
--    de crédito del flujo del paciente. Preserva el pago (pago_id, monto) y
--    libera el slot viejo dejándolo como 'reprogramado'.
--    Optimistic lock en el destino → nunca genera doble reserva (TOCTOU).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reprogramar_turno_medico(
  p_turno_origen_id uuid,
  p_nuevo_turno_id  uuid,
  p_medico_id       uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_origen   RECORD;
  v_reservado INT;
BEGIN
  IF p_turno_origen_id = p_nuevo_turno_id THEN
    RETURN 'El turno nuevo es el mismo que el actual.';
  END IF;

  -- Lock + verificar turno origen
  SELECT id, paciente_id, medico_id, estado, monto, pago_id
    INTO v_origen
    FROM public.turnos
    WHERE id = p_turno_origen_id
    FOR UPDATE;

  IF NOT FOUND THEN RETURN 'Turno original no encontrado.'; END IF;
  IF v_origen.medico_id != p_medico_id THEN RETURN 'No te pertenece.'; END IF;
  IF v_origen.estado != 'confirmado' THEN
    RETURN 'Solo se puede reprogramar un turno confirmado.';
  END IF;
  IF v_origen.paciente_id IS NULL THEN RETURN 'El turno no tiene paciente.'; END IF;

  -- Mover al paciente al nuevo turno (optimistic lock: solo si está disponible
  -- y es del mismo médico). Preserva el pago y el monto pagado.
  UPDATE public.turnos SET
    estado          = 'confirmado',
    paciente_id     = v_origen.paciente_id,
    monto           = v_origen.monto,
    pago_id         = v_origen.pago_id,
    turno_origen_id = p_turno_origen_id
  WHERE id = p_nuevo_turno_id
    AND estado = 'disponible'
    AND medico_id = p_medico_id;

  GET DIAGNOSTICS v_reservado = ROW_COUNT;
  IF v_reservado = 0 THEN
    RETURN 'El turno destino ya no está disponible o es de otro médico.';
  END IF;

  -- Liberar el turno origen: queda como reprogramado (estado liberado para el
  -- sistema) y se le quita el pago para que la plata viva en el turno nuevo.
  UPDATE public.turnos SET
    estado  = 'reprogramado',
    pago_id = NULL
  WHERE id = p_turno_origen_id;

  RETURN 'ok';
END;
$function$;

-- Solo service_role (createAdminClient) puede ejecutarlo. NUNCA anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.reprogramar_turno_medico(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reprogramar_turno_medico(uuid, uuid, uuid) TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 2) Fix del RPC del PACIENTE (CRÍTICO-1).
--    El RPC marca el crédito como usado pero NO cambiaba el estado del origen.
--    Si el origen estaba 'confirmado', quedaba confirmado → doble turno activo.
--    Agregamos el cambio de estado del origen a 'reprogramado'.
--    (Hoy este RPC está dormido — sin caller en prod —, es un fix preventivo.)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reprogramar_turno_atomico(
  p_turno_origen_id uuid,
  p_nuevo_turno_id  uuid,
  p_paciente_id     uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
    reprogramaciones = COALESCE(reprogramaciones, 0) + 1,
    estado = 'reprogramado'  -- ← FIX CRÍTICO-1: liberar el slot origen
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
$function$;


-- ────────────────────────────────────────────────────────────────────────────
-- 3) REVOKE EXECUTE del RPC del paciente a anon/authenticated (IMPORTANTE-1).
--    Es SECURITY DEFINER e invocable directo vía PostgREST. Se autovalida, pero
--    es superficie innecesaria. Solo service_role debe poder llamarlo.
-- ────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.reprogramar_turno_atomico(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reprogramar_turno_atomico(uuid, uuid, uuid) TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 4) CHECK defensivo: el monto del turno no puede ser negativo (CRÍTICO-2).
--    La validación de rango ya está en el route; esto es la red en DB.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.turnos
  ADD CONSTRAINT turnos_monto_no_negativo CHECK (monto IS NULL OR monto >= 0);
