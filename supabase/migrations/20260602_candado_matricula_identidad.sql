-- ─────────────────────────────────────────────────────────────────────────────
-- A1 (auditoría Roberto): candado de matrícula/DNI una vez validada la identidad.
--
-- Decisión de Diego: una vez que el médico validó identidad (Didit) + matrícula
-- (REFEPS), esos campos quedan CONGELADOS. No se pueden editar más — ni desde la
-- app ni con un UPDATE directo a PostgREST. El candado vive en la DB (la caja
-- fuerte), no en el endpoint, así no hay puerta de servicio para saltearlo.
--
-- Cierra el TOCTOU: validar con la matrícula propia y luego cambiarla por la de
-- otro médico, manteniendo el sello de "identidad verificada".
--
-- Se reemplaza la función del trigger reverificar_medico (migración 049),
-- sumando el candado. Comportamiento original (resetear verificado al cambiar
-- matrícula) se mantiene intacto para médicos aún no validados.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reverificar_medico()
RETURNS trigger AS $$
BEGIN
  -- CANDADO: si la identidad ya está validada, matrícula/DNI/tipo/provincia
  -- quedan congelados. Cualquier intento de cambiarlos se rechaza.
  IF OLD.identidad_validada = true AND (
    OLD.numero_matricula IS DISTINCT FROM NEW.numero_matricula
    OR OLD.tipo_matricula IS DISTINCT FROM NEW.tipo_matricula
    OR OLD.dni IS DISTINCT FROM NEW.dni
    OR OLD.provincia_matricula IS DISTINCT FROM NEW.provincia_matricula
  ) THEN
    RAISE EXCEPTION 'matricula_dni_congelados: los datos de matrícula y DNI no se pueden modificar una vez validada la identidad'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Comportamiento original (049): si un médico verificado-pero-no-validado
  -- cambia matrícula/DNI, vuelve a revisión.
  IF OLD.verificado = true AND (
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger trg_reverificar_medico (049) ya apunta a esta función; con el
-- CREATE OR REPLACE alcanza, no hace falta recrearlo.
