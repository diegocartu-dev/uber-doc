// ============================================================================
// componerEvolucion — motor de composición de la evolución clínica
// ----------------------------------------------------------------------------
// Función PURA (sin IO, sin DB). Re-ordena datos que YA cargó un humano
// (triage del paciente, diagnóstico/indicaciones/receta del médico, demográficos)
// en el campo Evolución de la HC.
//
// PRINCIPIO INNEGOCIABLE (Diego): cada palabra de la evolución tiene un autor
// humano. Esta plantilla SOLO re-ordena datos cargados. NUNCA inventa contenido
// que un humano no escribió: nada de pautas de alarma, "niega alergias", signos
// vitales ni examen físico. Si un dato falta, la sección entera desaparece.
//
// FORMATO (Diego, spec 07/06/2026): transcripción corrida por "etiqueta: contenido".
// NO es prosa narrativa. Etiquetas en minúscula seguidas de dos puntos, todo en
// un párrafo, secciones separadas por ". ", el string termina en ".".
//
// Plantilla (las secciones sin contenido se omiten por completo):
//   paciente: {sexo}, de {edad} años. refiere al ingreso: {motivo}, {síntomas} hace {plazo}.
//   se diagnostica: {diagnóstico}. se indica: {receta}, {indicaciones}.
//   comentarios adicionales: {comentario}.
//
// Ejemplo real (debe matchear EXACTO):
//   paciente: masculino, de 38 años. refiere al ingreso: le duele mucho la panza,
//   dolor abdominal, fiebre hace 1-3 días. se diagnostica: gastroenteritis aguda.
//   se indica: buscapina 10 mg, cápsulas blandas, 1 comprimido cada 8 hs, dieta
//   blanda y reposo 48 hs. comentarios adicionales: paciente alérgico al sertal.
// ============================================================================

export interface DatosEvolucion {
  /** Edad en años ya calculada por el caller (ver calcularEdad del workspace). */
  edad: number | null;
  sexo: "masculino" | "femenino" | null;
  /** Motivo de consulta libre del triage. */
  motivo: string | null;
  /** Lista de síntomas del triage (puede incluir "Otro", que se filtra). */
  sintomas: string[] | null;
  /** Valor CRUDO del triage (ej. "1-3 días"). Se pasa a minúscula tras "hace". */
  plazo: string | null;
  diagnostico: string | null;
  indicaciones: string | null;
  /** Receta YA serializada a texto (ver serializarMedicamentos del workspace). */
  receta: string | null;
  comentario: string | null;
}

function limpiar(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/**
 * minusculaInicial — baja SOLO la primera letra, dejando el resto intacto.
 * Los síntomas del triage vienen capitalizados ("Dolor de garganta") y el plazo
 * arranca en mayúscula ("Menos de 24 horas"); queremos que fluyan en la
 * transcripción corrida ("dolor de garganta", "hace menos de 24 horas").
 * NO tocamos siglas internas.
 */
function minusculaInicial(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Plazo del triage → cola "hace {plazo en minúscula}". Devuelve solo el valor
 * en minúscula (sin "hace"); el bloque de síntomas agrega "hace". El valor crudo
 * del triage va tal cual salvo la primera letra: "1-3 días" → "1-3 días",
 * "Menos de 24 horas" → "menos de 24 horas", "Más de 2 semanas" → "más de 2 semanas".
 * Devuelve "" si no hay plazo.
 */
function plazoNatural(plazo: string | null): string {
  const raw = limpiar(plazo);
  return raw ? minusculaInicial(raw) : "";
}

// ---------------------------------------------------------------------------
// Construcción de cada sección. Cada función devuelve "etiqueta: contenido" SIN
// el punto de cierre (el armado final agrega ". "), o "" si no hay dato.
// ---------------------------------------------------------------------------

/** "paciente: {sexo}, de {edad} años" — sexo primero. Tolerante a faltantes. */
function seccionPaciente(edad: number | null, sexo: DatosEvolucion["sexo"]): string {
  const tieneEdad = typeof edad === "number" && Number.isFinite(edad) && edad >= 0;
  const tieneSexo = sexo === "masculino" || sexo === "femenino";

  const partes: string[] = [];
  if (tieneSexo) partes.push(sexo as string);
  if (tieneEdad) partes.push(`de ${edad} años`);

  // En la práctica siempre hay sexo+edad. Si por dato corrupto faltan ambos,
  // omitimos la sección entera (mejor que "paciente: .").
  if (partes.length === 0) return "";
  return `paciente: ${partes.join(", ")}`;
}

/**
 * "refiere al ingreso: {motivo}, {síntomas} hace {plazo}".
 * Turnos no tienen triage: si no hay motivo NI síntomas, la sección se omite.
 * Variantes defensivas: solo motivo, solo síntomas, síntomas sin plazo.
 */
function seccionRefiere(
  motivo: string | null,
  sintomas: string[] | null,
  plazo: string | null
): string {
  const m = limpiar(motivo);

  // Filtrar "Otro" (el motivo libre ya lo cubre) y vacíos. Bajar inicial para
  // que fluyan en la transcripción.
  const lista = (sintomas ?? [])
    .map((s) => limpiar(s))
    .filter((s) => s.length > 0 && s.toLowerCase() !== "otro")
    .map(minusculaInicial);

  // En esta transcripción corrida los síntomas se enumeran SOLO con comas
  // (sin " y " antes del último). Es lo que da la salida canónica de Diego
  // ("le duele mucho la panza, dolor abdominal, fiebre hace 1-3 días") y lo que
  // lee bien encadenado al motivo, también separado por coma. Ver reporte: esto
  // difiere de la letra de la spec ("la última con ' y '"); manda el ejemplo.
  const cola = plazoNatural(plazo);
  const sintomasFrase = lista.length > 0 ? lista.join(", ") : "";
  const sintomasConPlazo = sintomasFrase
    ? cola
      ? `${sintomasFrase} hace ${cola}`
      : sintomasFrase
    : "";

  // Sin motivo ni síntomas → no hay sección (caso turno).
  if (!m && !sintomasConPlazo) return "";

  const cuerpo = [m, sintomasConPlazo].filter((p) => p.length > 0).join(", ");
  return `refiere al ingreso: ${cuerpo}`;
}

/** "se diagnostica: {diagnóstico}" tal cual lo escribió el médico. */
function seccionDiagnostico(diagnostico: string | null): string {
  const d = limpiar(diagnostico);
  return d ? `se diagnostica: ${d}` : "";
}

/**
 * "se indica: {receta}, {indicaciones}" — RECETA PRIMERO, SIEMPRE.
 * Saca el prefijo "Rp/" (o "Rp/ ") de la receta serializada acá (en el documento
 * de receta queda igual). Si no hay ninguna de las dos, omite la sección.
 */
function seccionIndica(receta: string | null, indicaciones: string | null): string {
  const r = limpiar(receta).replace(/^Rp\/\s*/, "").trim();
  const i = limpiar(indicaciones);

  const cuerpo = [r, i].filter((p) => p.length > 0).join(", ");
  return cuerpo ? `se indica: ${cuerpo}` : "";
}

/** "comentarios adicionales: {comentario}" — texto del médico, tal cual. */
function seccionComentario(comentario: string | null): string {
  const c = limpiar(comentario);
  return c ? `comentarios adicionales: ${c}` : "";
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Compone el texto de la evolución a partir de datos ya cargados por humanos.
 * Determinística, pura, sin IO. Las secciones sin dato se omiten por completo.
 * Une las secciones con ". " y cierra con ".". Nunca deja etiquetas colgadas
 * ("se indica: .") ni inventa contenido.
 */
export function componerEvolucion(datos: DatosEvolucion): string {
  const secciones = [
    seccionPaciente(datos.edad, datos.sexo),
    seccionRefiere(datos.motivo, datos.sintomas, datos.plazo),
    seccionDiagnostico(datos.diagnostico),
    seccionIndica(datos.receta, datos.indicaciones),
    seccionComentario(datos.comentario),
  ].filter((s) => s.length > 0);

  if (secciones.length === 0) return "";

  const cuerpo = secciones.join(". ");
  // Cierre con un único punto. Si el contenido humano de la última sección ya
  // termina en signo de cierre (p. ej. el comentario del médico "Control en 48 hs."),
  // no duplicamos el punto — sin tocar su texto, solo decidimos si agregar el nuestro.
  return /[.!?]$/.test(cuerpo) ? cuerpo : `${cuerpo}.`;
}
