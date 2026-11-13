-- 047 — espejo de `supabase/migrations/20261113_cambiar_matricula_validada.sql`.
-- `medicos` es tabla compartida y la ficha del profesional corre en los dos deploys.
-- =============================================================================
-- Elegir otra matrícula de REFEPS con la identidad ya validada (13/11/2026).
--
-- POR QUÉ: validada la identidad, la matrícula queda congelada para todos
-- (candado de junio). Eso dejó sin salida a los profesionales validados antes
-- del cruce con REFEPS (01/10) cuya ficha tiene una matrícula que REFEPS ya no
-- da por habilitada, aunque tengan otra habilitada: ni el panel ni ellos podían
-- cambiarla, y la pantalla les decía "escribinos a soporte".
--
-- QUÉ CAMBIA: una sola puerta, `cambiar_matricula_validada`, que solo puede
-- llamar el servidor (service role). El servidor la llama después de confirmar
-- el DNI con la biometría y de consultar REFEPS en vivo: la matrícula nueva
-- tiene que ser una habilitada, de su profesión, que REFEPS tenga para ese DNI.
-- Por esa puerta el candado deja pasar tipo, número y provincia de la matrícula
-- (el DNI NUNCA) y el profesional sigue aprobado: es la misma persona con otra
-- de sus matrículas oficiales. Todo lo demás queda como estaba.
--
-- La puerta es una marca que dura lo que dura la transacción y que el trigger
-- solo respeta fuera de la sesión de un usuario (`authenticated` / `anon`).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reverificar_medico()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
DECLARE
  -- Cambio pedido por el servidor con una matrícula que REFEPS confirmó en vivo.
  v_cambio_refeps boolean :=
    coalesce(current_setting('docto.cambio_matricula_refeps', true), '') = 'on'
    AND coalesce(current_setting('role', true), '') NOT IN ('authenticated', 'anon')
    AND coalesce(OLD.identidad_validada, false)
    AND coalesce(NEW.identidad_validada, false);
BEGIN
  -- CANDADO: si la identidad ya está validada, el DNI queda congelado siempre.
  IF OLD.identidad_validada = true AND OLD.dni IS DISTINCT FROM NEW.dni THEN
    RAISE EXCEPTION 'matricula_dni_congelados: los datos de matrícula y DNI no se pueden modificar una vez validada la identidad'
      USING ERRCODE = 'check_violation';
  END IF;
  -- La matrícula también, salvo por la puerta de arriba.
  IF OLD.identidad_validada = true AND NOT v_cambio_refeps AND (
    OLD.numero_matricula IS DISTINCT FROM NEW.numero_matricula
    OR OLD.tipo_matricula IS DISTINCT FROM NEW.tipo_matricula
    OR OLD.provincia_matricula IS DISTINCT FROM NEW.provincia_matricula
  ) THEN
    RAISE EXCEPTION 'matricula_dni_congelados: los datos de matrícula y DNI no se pueden modificar una vez validada la identidad'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Comportamiento original (049): si un médico verificado-pero-no-validado
  -- cambia matrícula/DNI, vuelve a revisión. Por la puerta no: sigue aprobado.
  IF OLD.verificado = true AND NOT v_cambio_refeps AND (
    OLD.numero_matricula IS DISTINCT FROM NEW.numero_matricula
    OR OLD.tipo_matricula IS DISTINCT FROM NEW.tipo_matricula
    OR OLD.dni IS DISTINCT FROM NEW.dni
    OR OLD.provincia_matricula IS DISTINCT FROM NEW.provincia_matricula
  ) THEN
    NEW.verificado := false;
    NEW.estado_registro := 'pendiente_revision';
    NEW.verificado_at := NULL;
    NEW.verificado_por := NULL;
  END IF;

  -- 13/10/2026: REFEPS, la matrícula y la aprobación valen para una profesión.
  -- Con la identidad validada, la matrícula ya quedó congelada (candado de
  -- arriba) y el cruce no vuelve a correr: cambiar la profesión dejaría a la
  -- persona con la matrícula y las provincias de la otra. Se rechaza igual que
  -- la matrícula. Antes de validar la identidad, REFEPS se vuelve a validar con
  -- la profesión nueva y, si estaba aprobado, vuelve a revisión.
  IF OLD.profesion IS DISTINCT FROM NEW.profesion AND OLD.identidad_validada = true THEN
    RAISE EXCEPTION 'profesion_congelada: la profesión no se puede modificar una vez validada la identidad'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.profesion IS DISTINCT FROM NEW.profesion THEN
    NEW.refeps_validado := false;
    IF OLD.verificado = true OR NEW.estado_registro = 'aprobado' THEN
      NEW.verificado := false;
      NEW.estado_registro := 'pendiente_revision';
      NEW.verificado_at := NULL;
      NEW.verificado_por := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- La puerta. Devuelve cuántas fichas cambió (0 = la ficha ya no estaba como se leyó).
-- El rastro en `admin_audit_log` se escribe ACÁ, en la misma transacción: o
-- quedan el cambio y su rastro, o no queda ninguno de los dos.
-- `p_admin_user_id` vacío = lo pidió el propio profesional (va en `p_metadata`).
CREATE OR REPLACE FUNCTION public.cambiar_matricula_validada(
  p_medico_id uuid,
  p_tipo text,
  p_numero text,
  p_provincia text,
  p_tipo_anterior text,
  p_numero_anterior text,
  p_provincia_anterior text,
  p_admin_user_id uuid,
  p_motivo text,
  p_metadata jsonb
)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path = public
AS $$
DECLARE
  v_filas integer;
BEGIN
  IF p_medico_id IS NULL
     OR p_tipo IS NULL OR p_tipo NOT IN ('MN', 'MP')
     OR coalesce(btrim(p_numero), '') = ''
     OR (p_tipo = 'MP' AND coalesce(btrim(p_provincia), '') = '')
     OR (p_tipo = 'MN' AND p_provincia IS NOT NULL) THEN
    RAISE EXCEPTION 'matricula_invalida: tipo, número o provincia no tienen la forma esperada'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('docto.cambio_matricula_refeps', 'on', true);

  UPDATE medicos
     SET tipo_matricula = p_tipo,
         numero_matricula = p_numero,
         provincia_matricula = p_provincia
   WHERE id = p_medico_id
     AND identidad_validada = true
     AND tipo_matricula IS NOT DISTINCT FROM p_tipo_anterior
     AND numero_matricula IS NOT DISTINCT FROM p_numero_anterior
     AND provincia_matricula IS NOT DISTINCT FROM p_provincia_anterior;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  -- La marca no sobrevive a esta llamada (si algo falla, la transacción entera
  -- se deshace y la marca con ella).
  PERFORM set_config('docto.cambio_matricula_refeps', 'off', true);

  IF v_filas = 1 THEN
    INSERT INTO admin_audit_log
      (admin_user_id, accion, recurso_tipo, recurso_id, desde_mobile, payload_anterior, payload_nuevo, motivo, metadata)
    VALUES (
      p_admin_user_id,
      'corregir_matricula',
      'medico',
      p_medico_id::text,
      false,
      jsonb_build_object('tipo_matricula', p_tipo_anterior, 'numero_matricula', p_numero_anterior, 'provincia_matricula', p_provincia_anterior),
      jsonb_build_object('tipo_matricula', p_tipo, 'numero_matricula', p_numero, 'provincia_matricula', p_provincia),
      p_motivo,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('identidad_validada', true)
    );
  END IF;

  RETURN v_filas;
END;
$$;

REVOKE ALL ON FUNCTION public.cambiar_matricula_validada(uuid, text, text, text, text, text, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cambiar_matricula_validada(uuid, text, text, text, text, text, text, uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.cambiar_matricula_validada(uuid, text, text, text, text, text, text, uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_matricula_validada(uuid, text, text, text, text, text, text, uuid, text, jsonb) TO service_role;
