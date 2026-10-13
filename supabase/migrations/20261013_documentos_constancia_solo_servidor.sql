-- =============================================================================
-- La constancia la guarda solo el servidor (13/10/2026).
--
-- La constancia dice que el paciente asistió, y el servidor la emite solo si
-- la sala registró que entró (lib/documentos/emitir-constancia.ts). La policy
-- "Médicos insertan documentos" dejaba que el profesional, con su sesión y la
-- clave pública, insertara directo una de cualquier turno y contenido. Desde
-- acá la sesión del profesional puede insertar todo lo de antes salvo una
-- constancia (el service role no pasa por la RLS).
--
-- Y la función del trigger de profesión no se ejecuta desde la API.
-- Va también a la base institucional (044).
-- =============================================================================

ALTER POLICY "Médicos insertan documentos" ON public.documentos
  WITH CHECK (
    medico_id = (SELECT medicos.id FROM medicos WHERE medicos.user_id = auth.uid())
    AND tipo IS DISTINCT FROM 'constancia'
  );

REVOKE EXECUTE ON FUNCTION public.documento_segun_profesion() FROM PUBLIC, anon, authenticated;
