// Catálogo ÚNICO de especialidades (pedido Diego 31/08/2026).
//
// Nació de un pedido real: una profesional registrada en Cirugía plástica pidió
// figurar TAMBIÉN en Clínica médica, porque atiende dolencias comunes.
//
// ── POR QUÉ UNA PRINCIPAL Y OTRAS ADICIONALES, Y NO UNA LISTA PLANA ──────────
// `medicos.especialidad` es UNA sola y así se queda: es la que agrupa en el
// tablero, en la oferta por especialidad y en el aviso al paciente. Si un
// profesional pudiera tener N especialidades "iguales", cada reporte tendría que
// decidir por cuál lo cuenta, y el mismo médico aparecería sumado en dos
// columnas. Es el mismo razonamiento por el que `areas_atencion` NO es una
// especialidad nueva (ver lib/areas-atencion.ts).
//
// Las ADICIONALES son declarativas: hacen que el profesional aparezca cuando el
// paciente busca esa especialidad, y se muestran en su ficha. No cambian a quién
// pertenece en los conteos.
//
// La lista vivía como const adentro del formulario de registro. Acá es una sola
// para que el registro, la validación de las adicionales y cualquier pantalla
// nueva no puedan divergir.

export const ESPECIALIDADES = [
  "Alergia e inmunología",
  "Anatomía patológica",
  "Anestesiología",
  "Cardiología",
  "Cirugía cardiovascular",
  "Cirugía general",
  "Cirugía pediátrica",
  "Cirugía plástica y reparadora",
  "Cirugía torácica",
  "Cirugía vascular",
  "Clínica médica",
  "Coloproctología",
  "Cuidados paliativos",
  "Dermatología",
  "Diagnóstico por imágenes",
  "Emergentología",
  "Endocrinología",
  "Farmacología clínica",
  "Fisiatría",
  "Flebología",
  "Gastroenterología",
  "Genética médica",
  "Geriatría",
  "Ginecología",
  "Hematología",
  "Hemoterapia e inmunohematología",
  "Hepatología",
  "Infectología",
  "Mastología",
  "Medicina del deporte",
  "Medicina del trabajo",
  "Medicina familiar",
  "Medicina general y familiar",
  "Medicina legal",
  "Medicina nuclear",
  "Nefrología",
  "Neonatología",
  "Neumonología",
  "Neurocirugía",
  "Neurología",
  "Nutrición",
  "Obstetricia",
  "Oftalmología",
  "Oncología",
  "Ortopedia y traumatología",
  "Otorrinolaringología",
  "Patología",
  "Pediatría",
  "Psiquiatría",
  "Radioterapia",
  "Reumatología",
  "Terapia intensiva",
  "Toxicología",
  "Urología",
] as const;

/** Lo que se guarda en `medicos.especialidades_adicionales` (jsonb: array de strings). */
export function parsearEspecialidadesAdicionales(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s || vistas.has(s)) continue;
    vistas.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Las que se muestran/buscan: las adicionales SIN la principal. Guardar la
 * principal entre las adicionales es un error de carga que se ve feo
 * ("Clínica médica · Clínica médica"), no un motivo para romper la ficha.
 */
export function adicionalesVisibles(principal: string | null | undefined, adicionales: string[]): string[] {
  const p = (principal ?? "").trim().toLocaleLowerCase("es");
  return adicionales.filter((e) => e.trim().toLocaleLowerCase("es") !== p);
}
