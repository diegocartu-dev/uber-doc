-- Fix C1 (gate Roberto #263, CRÍTICO pre-existente): `identidad_validada` y
-- `biometria_exenta` eran AUTO-ESCRIBIBLES por el propio médico vía PostgREST
-- (GRANT UPDATE a nivel tabla + policy own-row sin restricción de columnas), y
-- el trigger protector no las cubría → un médico podía marcarse validado él
-- mismo y pasar los 7 puntos de enforcement. Se extiende el trigger a TODAS las
-- columnas de confianza (identidad, Didit, REFEPS, es_cuenta_test y el throttle
-- del recordatorio). El webhook/cron/admin escriben con service role (el guard
-- por rol no los afecta).
CREATE OR REPLACE FUNCTION public.proteger_verificacion_medico()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('role', true) = 'authenticated' THEN
    IF OLD.verificado IS DISTINCT FROM NEW.verificado THEN
      NEW.verificado := OLD.verificado;
    END IF;
    IF OLD.estado_registro IS DISTINCT FROM NEW.estado_registro THEN
      NEW.estado_registro := OLD.estado_registro;
    END IF;
    IF OLD.verificado_at IS DISTINCT FROM NEW.verificado_at THEN
      NEW.verificado_at := OLD.verificado_at;
    END IF;
    IF OLD.verificado_por IS DISTINCT FROM NEW.verificado_por THEN
      NEW.verificado_por := OLD.verificado_por;
    END IF;
    -- Identidad biométrica (Didit) — el gateado no puede escribirse el gate.
    IF OLD.identidad_validada IS DISTINCT FROM NEW.identidad_validada THEN
      NEW.identidad_validada := OLD.identidad_validada;
    END IF;
    IF OLD.identidad_validada_at IS DISTINCT FROM NEW.identidad_validada_at THEN
      NEW.identidad_validada_at := OLD.identidad_validada_at;
    END IF;
    IF OLD.biometria_exenta IS DISTINCT FROM NEW.biometria_exenta THEN
      NEW.biometria_exenta := OLD.biometria_exenta;
    END IF;
    IF OLD.didit_status IS DISTINCT FROM NEW.didit_status THEN
      NEW.didit_status := OLD.didit_status;
    END IF;
    IF OLD.didit_session_id IS DISTINCT FROM NEW.didit_session_id THEN
      NEW.didit_session_id := OLD.didit_session_id;
    END IF;
    -- REFEPS y marca de cuenta test — misma clase de columna de confianza.
    IF OLD.refeps_validado IS DISTINCT FROM NEW.refeps_validado THEN
      NEW.refeps_validado := OLD.refeps_validado;
    END IF;
    IF OLD.es_cuenta_test IS DISTINCT FROM NEW.es_cuenta_test THEN
      NEW.es_cuenta_test := OLD.es_cuenta_test;
    END IF;
    IF OLD.identidad_recordatorio_at IS DISTINCT FROM NEW.identidad_recordatorio_at THEN
      NEW.identidad_recordatorio_at := OLD.identidad_recordatorio_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Hardening O4 (mismo gate): anon/authenticated tenían DELETE y TRUNCATE a nivel
-- tabla por default de Supabase. DELETE lo frena RLS (sin policy), pero TRUNCATE
-- NO pasa por RLS. Sin vector hoy (PostgREST no expone TRUNCATE) — defensa en
-- profundidad.
REVOKE DELETE, TRUNCATE ON public.medicos FROM anon, authenticated;
