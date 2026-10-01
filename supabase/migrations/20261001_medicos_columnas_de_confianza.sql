-- =============================================================================
-- Columnas de confianza de `medicos`: el profesional no las crea ni las cambia
-- con su propia sesión (hallazgo 01/10/2026).
--
-- Qué pasaba — probado en producción con cuentas test, en transacciones que se
-- deshicieron solas (no quedó nada escrito):
--  1. Cualquier usuario logueado, incluso un paciente, podía crear su propia
--     ficha de médico directo por PostgREST con identidad_validada,
--     refeps_validado y biometria_exenta en true. La policy de INSERT solo
--     exigía verificado=false y estado 'pendiente_revision', y el trigger que
--     protege esas columnas es solo de UPDATE. El panel la mostraba en verde, y
--     el gate de aprobar no vuelve a consultar REFEPS si refeps_validado ya es true.
--  2. Un profesional podía cambiarse directo, salteando la aplicación: categoria
--     (el coste por uso), jurisdicciones (aparecer en provincias donde no tiene
--     matrícula), especialidad y especialidades adicionales, las notas del
--     equipo, refeps_data / refeps_validado_at, y su DNI y matrícula antes de
--     validar la identidad.
--
-- Ningún flujo de la aplicación crea fichas ni escribe esas columnas con la
-- sesión del usuario: el alta es con service role (registro-medico/actions.ts,
-- institucional/demo-profesional.ts) y el perfil también (api/medico/perfil).
-- Relevamiento de TODOS los escritores, columna por columna: PR de este cambio.
--
-- NO cubre, a propósito (tienen escritores legítimos con la sesión del usuario;
-- se mudan a service role en un paso aparte, si no se romperían EN SILENCIO):
-- disponible / disponible_desde / disponible_hasta / disponible_desde_at,
-- precio_consulta, duracion_consulta, foto_url, firma_manuscrita_url. Tampoco
-- nombre_completo: lo edita el profesional en /mis-datos, y congelarlo con la
-- identidad validada es una decisión de producto pendiente.
--
-- Va también en la base de la instancia institucional (se provisiona con este
-- mismo schema). NO APLICAR sin OK de Diego.
-- =============================================================================

-- 1 · Nadie crea una ficha de médico con su sesión (el alta es del servidor).
DROP POLICY IF EXISTS "Médicos pueden crear su perfil" ON public.medicos;
REVOKE INSERT ON public.medicos FROM anon, authenticated;

-- 2 · Columnas de confianza: lo que el rol authenticated escriba en ellas se
-- revierte en silencio (mismo mecanismo que ya protege verificación, identidad
-- y REFEPS). El servidor (service role) no pasa por este bloque.
CREATE OR REPLACE FUNCTION public.proteger_verificacion_medico()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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

    -- 01/10/2026 — columnas que deciden plata, ruteo y lo que el equipo ve como verificado.
    -- Coste por uso de la plataforma (get_comision_medico la lee).
    IF OLD.categoria IS DISTINCT FROM NEW.categoria THEN NEW.categoria := OLD.categoria; END IF;
    -- Dónde puede atender (se deriva de REFEPS; la clínica rutea por esto).
    IF OLD.jurisdicciones IS DISTINCT FROM NEW.jurisdicciones THEN NEW.jurisdicciones := OLD.jurisdicciones; END IF;
    -- Cómo figura en la clínica y en la receta.
    IF OLD.especialidad IS DISTINCT FROM NEW.especialidad THEN NEW.especialidad := OLD.especialidad; END IF;
    IF OLD.especialidades_adicionales IS DISTINCT FROM NEW.especialidades_adicionales THEN NEW.especialidades_adicionales := OLD.especialidades_adicionales; END IF;
    -- Lo que REFEPS dijo y cuándo (el panel y los documentos firmados lo muestran).
    IF OLD.refeps_data IS DISTINCT FROM NEW.refeps_data THEN NEW.refeps_data := OLD.refeps_data; END IF;
    IF OLD.refeps_validado_at IS DISTINCT FROM NEW.refeps_validado_at THEN NEW.refeps_validado_at := OLD.refeps_validado_at; END IF;
    -- Notas del equipo.
    IF OLD.notas_admin IS DISTINCT FROM NEW.notas_admin THEN NEW.notas_admin := OLD.notas_admin; END IF;
    -- DNI y matrícula: el perfil los edita con service role (con sus propias reglas);
    -- por la sesión del profesional, no.
    IF OLD.dni IS DISTINCT FROM NEW.dni THEN NEW.dni := OLD.dni; END IF;
    IF OLD.tipo_matricula IS DISTINCT FROM NEW.tipo_matricula THEN NEW.tipo_matricula := OLD.tipo_matricula; END IF;
    IF OLD.numero_matricula IS DISTINCT FROM NEW.numero_matricula THEN NEW.numero_matricula := OLD.numero_matricula; END IF;
    IF OLD.provincia_matricula IS DISTINCT FROM NEW.provincia_matricula THEN NEW.provincia_matricula := OLD.provincia_matricula; END IF;
    IF OLD.provincia IS DISTINCT FROM NEW.provincia THEN NEW.provincia := OLD.provincia; END IF;
    -- Perfil público, identificadores, registros legales y baja.
    IF OLD.slug IS DISTINCT FROM NEW.slug THEN NEW.slug := OLD.slug; END IF;
    IF OLD.id IS DISTINCT FROM NEW.id THEN NEW.id := OLD.id; END IF;
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN NEW.user_id := OLD.user_id; END IF;
    IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN NEW.created_at := OLD.created_at; END IF;
    IF OLD.declaracion_matricula_at IS DISTINCT FROM NEW.declaracion_matricula_at THEN NEW.declaracion_matricula_at := OLD.declaracion_matricula_at; END IF;
    IF OLD.terminos_aceptados_at IS DISTINCT FROM NEW.terminos_aceptados_at THEN NEW.terminos_aceptados_at := OLD.terminos_aceptados_at; END IF;
    IF OLD.dado_de_baja IS DISTINCT FROM NEW.dado_de_baja THEN NEW.dado_de_baja := OLD.dado_de_baja; END IF;
    IF OLD.dado_de_baja_at IS DISTINCT FROM NEW.dado_de_baja_at THEN NEW.dado_de_baja_at := OLD.dado_de_baja_at; END IF;
    IF OLD.foto_credencial_url IS DISTINCT FROM NEW.foto_credencial_url THEN NEW.foto_credencial_url := OLD.foto_credencial_url; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3 · El log de auditoría acepta acciones del sistema (sin administrador): la
-- matrícula que el cruce de identidad toma de REFEPS queda registrada con
-- admin_user_id vacío y metadata.actor = 'sistema'.
ALTER TABLE public.admin_audit_log ALTER COLUMN admin_user_id DROP NOT NULL;
