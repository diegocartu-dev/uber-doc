// ─── Helper reutilizable: verificación de datos de cobertura ─────────────────
// PR 1: usado en WorkspaceConsulta para decidir si mostrar modal automático.
// PR 2: será usado en pantalla pre-consulta del paciente.

export type DatosCobertura = {
  tiene_cobertura: boolean | null;
  obra_social: string | null;
  nro_afiliado: string | null;
  plan_obra_social: string | null;
};

/**
 * Determina si los datos de cobertura del paciente están completos.
 *
 * Completo = el médico puede firmar la receta sin modal intermedio.
 *
 * | Estado                              | ¿Completo? |
 * |-------------------------------------|------------|
 * | tiene_cobertura = false (particular) | Sí         |
 * | OOSS + Nº Afiliado cargados         | Sí         |
 * | OOSS + sin Nº Afiliado              | No         |
 * | tiene_cobertura IS NULL              | No         |
 *
 * Nota: plan_obra_social NO entra en la verificación. Puede estar vacío.
 */
export function datosCoberturaCompletos(p: DatosCobertura): boolean {
  // Particular explícito → completo
  if (p.tiene_cobertura === false) return true;

  // Con OOSS + Nro afiliado → completo
  if (
    p.tiene_cobertura === true &&
    p.obra_social &&
    p.obra_social.trim() !== "" &&
    p.nro_afiliado &&
    p.nro_afiliado.trim() !== ""
  ) {
    return true;
  }

  // Todo lo demás → incompleto
  return false;
}
