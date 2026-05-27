-- ============================================================================
-- Migracion: Foto de perfil ya NO es bloqueante para perfil_completo
-- Sprint: Post-QA E2E 27/05
-- Fecha: 2026-05-27
-- ============================================================================
-- Decision de Diego (27/05): foto de perfil queda como RECOMENDADO (no bloquea CI).
-- Razon: reducir friccion de onboarding para los primeros 30 medicos seed.
-- La regulacion AAIP/REFEPS no exige foto.
--
-- Si en el futuro se decide hacerla bloqueante, agregar la linea de foto_url
-- nuevamente a esta funcion.
-- ============================================================================

CREATE OR REPLACE FUNCTION medico_perfil_completo(medico_row medicos)
RETURNS boolean AS $$
BEGIN
  RETURN (
    medico_row.nombre_completo IS NOT NULL AND TRIM(medico_row.nombre_completo) != '' AND
    medico_row.especialidad IS NOT NULL AND TRIM(medico_row.especialidad) != '' AND
    medico_row.numero_matricula IS NOT NULL AND TRIM(medico_row.numero_matricula) != '' AND
    medico_row.tipo_matricula IS NOT NULL AND TRIM(medico_row.tipo_matricula) != '' AND
    medico_row.telefono IS NOT NULL AND TRIM(medico_row.telefono) != '' AND
    -- foto_url REMOVIDO: decision de producto 27/05, foto es recomendado no bloqueante
    medico_row.domicilio_consultorio IS NOT NULL AND TRIM(medico_row.domicilio_consultorio) != ''
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Recalcular perfil_completo para todos los medicos
UPDATE medicos SET perfil_completo = medico_perfil_completo(medicos.*);
