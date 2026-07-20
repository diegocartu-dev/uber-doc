-- Motivo humano del "In Review" SINTÉTICO de identidad: Didit aprobó la
-- biometría pero el cruce anti-suplantación de Docto no cierra (DNI distinto o
-- matrícula que no figura en REFEPS). Lo escribe SOLO el service role
-- (reconciliarIdentidad); se limpia al validar. SIN GRANT a authenticated
-- (columna interna, mismo tratamiento que notas_admin — la policy pública de
-- medicos la expondría a pacientes).
-- Contexto: caso Williana 20/07/2026 — typo de matrícula la dejó días en un
-- "In Review" invisible e indistinguible; ahora el panel muestra el motivo y
-- el admin recibe alerta en la transición.
ALTER TABLE medicos ADD COLUMN IF NOT EXISTS identidad_revision_motivo TEXT;

-- Candado: la columna heredó UPDATE/INSERT a nivel tabla para authenticated/anon
-- → sin esto, el médico podría BORRARSE el motivo y esconder la bandera roja del
-- panel. Mismo mecanismo que el resto de las columnas de confianza (trigger
-- proteger_verificacion_medico, gate Roberto C1). Se re-crea la función entera
-- con el bloque nuevo al final.
CREATE OR REPLACE FUNCTION public.proteger_verificacion_medico() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  IF current_setting('role', true) = 'authenticated' THEN
    IF OLD.verificado IS DISTINCT FROM NEW.verificado THEN NEW.verificado := OLD.verificado; END IF;
    IF OLD.estado_registro IS DISTINCT FROM NEW.estado_registro THEN NEW.estado_registro := OLD.estado_registro; END IF;
    IF OLD.verificado_at IS DISTINCT FROM NEW.verificado_at THEN NEW.verificado_at := OLD.verificado_at; END IF;
    IF OLD.verificado_por IS DISTINCT FROM NEW.verificado_por THEN NEW.verificado_por := OLD.verificado_por; END IF;
    IF OLD.identidad_validada IS DISTINCT FROM NEW.identidad_validada THEN NEW.identidad_validada := OLD.identidad_validada; END IF;
    IF OLD.identidad_validada_at IS DISTINCT FROM NEW.identidad_validada_at THEN NEW.identidad_validada_at := OLD.identidad_validada_at; END IF;
    IF OLD.biometria_exenta IS DISTINCT FROM NEW.biometria_exenta THEN NEW.biometria_exenta := OLD.biometria_exenta; END IF;
    IF OLD.didit_status IS DISTINCT FROM NEW.didit_status THEN NEW.didit_status := OLD.didit_status; END IF;
    IF OLD.didit_session_id IS DISTINCT FROM NEW.didit_session_id THEN NEW.didit_session_id := OLD.didit_session_id; END IF;
    IF OLD.refeps_validado IS DISTINCT FROM NEW.refeps_validado THEN NEW.refeps_validado := OLD.refeps_validado; END IF;
    IF OLD.es_cuenta_test IS DISTINCT FROM NEW.es_cuenta_test THEN NEW.es_cuenta_test := OLD.es_cuenta_test; END IF;
    IF OLD.identidad_recordatorio_at IS DISTINCT FROM NEW.identidad_recordatorio_at THEN NEW.identidad_recordatorio_at := OLD.identidad_recordatorio_at; END IF;
    -- Motivo del In Review sintético — el médico no puede borrarse la bandera (20/07).
    IF OLD.identidad_revision_motivo IS DISTINCT FROM NEW.identidad_revision_motivo THEN NEW.identidad_revision_motivo := OLD.identidad_revision_motivo; END IF;
  END IF;
  RETURN NEW;
END;
$function$;
