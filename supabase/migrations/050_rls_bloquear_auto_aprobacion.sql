-- Migration 050: Bloquear auto-aprobación via RLS + trigger
-- Roberto detectó que la policy UPDATE de migración 001 permite que un médico
-- haga UPDATE verificado=true directamente contra Supabase.

-- 1. Policy UPDATE: médicos pueden actualizar su propio perfil (sin restricción de columnas)
-- La protección de campos sensibles la hace el trigger (abajo)
DROP POLICY IF EXISTS "Médicos pueden actualizar su perfil" ON public.medicos;

CREATE POLICY "Médicos pueden actualizar su perfil"
  ON public.medicos FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Policy INSERT: forzar verificado=false en todo INSERT desde client
DROP POLICY IF EXISTS "Médicos pueden crear su perfil" ON public.medicos;

CREATE POLICY "Médicos pueden crear su perfil"
  ON public.medicos FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND verificado = false
    AND estado_registro = 'pendiente_revision'
  );

-- 3. Trigger: impedir que un usuario se auto-apruebe
-- Solo service_role (admin) puede cambiar verificado o estado_registro.
-- current_setting('role') = 'authenticated' para usuarios normales via PostgREST.
CREATE OR REPLACE FUNCTION public.proteger_verificacion_medico()
RETURNS trigger AS $$
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
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proteger_verificacion ON public.medicos;

CREATE TRIGGER trg_proteger_verificacion
  BEFORE UPDATE ON public.medicos
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_verificacion_medico();
