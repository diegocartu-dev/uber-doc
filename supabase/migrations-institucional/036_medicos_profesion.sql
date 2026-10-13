-- 036 — espejo de `supabase/migrations/20261013_medicos_profesion.sql`.
--
-- La columna `profesion` la leen la clínica y el panel, que corren en los dos
-- deploys: sin ella (o sin su GRANT), esas lecturas fallan enteras.
--
-- ⚠ `proteger_verificacion_medico` de esta base NO tiene el bloque del 01/10
-- (columnas de confianza: categoria, jurisdicciones, especialidad…); es una
-- deuda anotada aparte. Acá se le suma solo la profesión, sobre su cuerpo actual.

ALTER TABLE public.medicos ADD COLUMN IF NOT EXISTS profesion text NOT NULL DEFAULT 'medico';
ALTER TABLE public.medicos DROP CONSTRAINT IF EXISTS medicos_profesion_check;
ALTER TABLE public.medicos ADD CONSTRAINT medicos_profesion_check
  CHECK (profesion = ANY (ARRAY['medico', 'psicologo']));

-- Los permisos de lectura de `medicos` son por columna: sin este GRANT, todo
-- SELECT del cliente que la pida falla entero y devuelve null (caída del 19-24/06).
GRANT SELECT (profesion) ON public.medicos TO anon, authenticated;

-- Un psicólogo nunca ofrece consulta inmediata: ni en la clínica (disponible)
-- ni desde su link propio (ci_en_consultorio). La aplicación lo rechaza antes
-- con un mensaje; esto es la red de abajo.
ALTER TABLE public.medicos DROP CONSTRAINT IF EXISTS medicos_psicologo_sin_consulta_inmediata;
ALTER TABLE public.medicos ADD CONSTRAINT medicos_psicologo_sin_consulta_inmediata
  CHECK (profesion <> 'psicologo' OR (disponible IS NOT TRUE AND ci_en_consultorio IS NOT TRUE));

CREATE OR REPLACE FUNCTION public.proteger_verificacion_medico()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('role', true) = 'authenticated' THEN
    IF OLD.verificado IS DISTINCT FROM NEW.verificado THEN NEW.verificado := OLD.verificado; END IF;
    IF OLD.estado_registro IS DISTINCT FROM NEW.estado_registro THEN NEW.estado_registro := OLD.estado_registro; END IF;
    IF OLD.verificado_at IS DISTINCT FROM NEW.verificado_at THEN NEW.verificado_at := OLD.verificado_at; END IF;
    IF OLD.verificado_por IS DISTINCT FROM NEW.verificado_por THEN NEW.verificado_por := OLD.verificado_por; END IF;
    -- Identidad biométrica (Didit) — el gateado no puede escribirse el gate.
    IF OLD.identidad_validada IS DISTINCT FROM NEW.identidad_validada THEN NEW.identidad_validada := OLD.identidad_validada; END IF;
    IF OLD.identidad_validada_at IS DISTINCT FROM NEW.identidad_validada_at THEN NEW.identidad_validada_at := OLD.identidad_validada_at; END IF;
    IF OLD.biometria_exenta IS DISTINCT FROM NEW.biometria_exenta THEN NEW.biometria_exenta := OLD.biometria_exenta; END IF;
    IF OLD.didit_status IS DISTINCT FROM NEW.didit_status THEN NEW.didit_status := OLD.didit_status; END IF;
    IF OLD.didit_session_id IS DISTINCT FROM NEW.didit_session_id THEN NEW.didit_session_id := OLD.didit_session_id; END IF;
    -- REFEPS y marca de cuenta test — misma clase de columna de confianza.
    IF OLD.refeps_validado IS DISTINCT FROM NEW.refeps_validado THEN NEW.refeps_validado := OLD.refeps_validado; END IF;
    IF OLD.es_cuenta_test IS DISTINCT FROM NEW.es_cuenta_test THEN NEW.es_cuenta_test := OLD.es_cuenta_test; END IF;
    IF OLD.identidad_recordatorio_at IS DISTINCT FROM NEW.identidad_recordatorio_at THEN NEW.identidad_recordatorio_at := OLD.identidad_recordatorio_at; END IF;
    -- Motivo del In Review sintético — el médico no puede borrarse la bandera (20/07).
    IF OLD.identidad_revision_motivo IS DISTINCT FROM NEW.identidad_revision_motivo THEN NEW.identidad_revision_motivo := OLD.identidad_revision_motivo; END IF;
    -- 13/10/2026 — La profesión decide qué matrícula vale, dónde aparece y si
    -- puede ofrecer consulta inmediata: la pone el alta, no la sesión.
    IF OLD.profesion IS DISTINCT FROM NEW.profesion THEN NEW.profesion := OLD.profesion; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverificar_medico()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
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

-- Matrícula única POR PROFESIÓN. Los colegios de médicos y de psicólogos
-- numeran cada uno por su lado: la MP 5555 de médico y la MP 5555 de psicólogo
-- de la misma provincia son dos personas distintas. El índice anterior no
-- dejaba registrar a la segunda ("Esta matrícula ya está registrada").
DROP INDEX IF EXISTS public.idx_medicos_matricula_unique;
CREATE UNIQUE INDEX idx_medicos_matricula_unique ON public.medicos
  USING btree (profesion, tipo_matricula, numero_matricula, COALESCE(provincia_matricula, ''::text));

-- El interruptor del registro de psicólogos, APAGADO: cada fase se mergea
-- dormida y se prende cuando están todas (se prende desde el admin).
INSERT INTO public.feature_flags (key, nombre, descripcion, activo, es_kill_switch)
VALUES (
  'registro_psicologos',
  'Registro de psicólogos',
  'Deja elegir "Psicólogo/a" en el registro de profesionales. Se prende cuando estén todas las fases (docs/sprints/2026-10-13-psicologos.md).',
  false,
  false
)
ON CONFLICT (key) DO NOTHING;
