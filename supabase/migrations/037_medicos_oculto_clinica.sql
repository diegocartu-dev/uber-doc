-- Agrega columna oculto_clinica a medicos para control de visibilidad por canal.
-- Cuando oculto_clinica = true, el médico no aparece en Clínica Virtual
-- pero sí sigue siendo accesible desde /dr/[slug]/consultorio.
-- Default false = comportamiento actual se mantiene sin cambios.

ALTER TABLE public.medicos
  ADD COLUMN oculto_clinica boolean NOT NULL DEFAULT false;

-- Actualizar policy RLS para respetar la visibilidad por canal.
-- Antes: cualquier autenticado veía todos los médicos (USING (true)).
-- Ahora: cada médico siempre ve su propio perfil; el resto solo ve médicos no ocultos.
DROP POLICY IF EXISTS "Usuarios autenticados ven perfiles de medicos" ON public.medicos;
CREATE POLICY "Usuarios autenticados ven perfiles de medicos"
  ON public.medicos FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR oculto_clinica = false
  );
