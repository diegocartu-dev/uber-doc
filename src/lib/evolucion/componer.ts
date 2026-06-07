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
// vitales ni examen físico. Si un dato falta, la frase entera desaparece.
//
// Reglas de redacción definidas por Martín (médico). Tono alineado con la
// evolución que genera Nova por voz (tercera persona médica formal):
// "Paciente refiere...", "Se indica...".
//
// Estructura (una frase por bloque, separadas por punto, las que falten se omiten):
//   Paciente de {edad} años, {sexo}. Consulta por {motivo}.
//   Refiere {síntomas} de {plazo} de evolución. Diagnóstico: {diagnóstico}.
//   Se indica {indicaciones}. Se prescribe {receta}. {comentario}
// ============================================================================

export interface DatosEvolucion {
  /** Edad en años ya calculada por el caller (ver calcularEdad del workspace). */
  edad: number | null;
  sexo: "masculino" | "femenino" | null;
  /** Motivo de consulta libre del triage. */
  motivo: string | null;
  /** Lista de síntomas del triage (puede incluir "Otro", que se filtra). */
  sintomas: string[] | null;
  /** Valor CRUDO del triage (ej. "1-3 días"). Se transforma a lenguaje natural. */
  plazo: string | null;
  diagnostico: string | null;
  indicaciones: string | null;
  /** Receta YA serializada a texto (ver serializarMedicamentos del workspace). */
  receta: string | null;
  comentario: string | null;
}

// ---------------------------------------------------------------------------
// Mapeo del plazo crudo del triage → cola "de {X} de evolución".
// Fuente de verdad: TIEMPO_OPCIONES en src/app/triage/page.tsx.
// Si el triage agrega/renombra una opción, agregarla acá (y un test).
// ---------------------------------------------------------------------------
const PLAZO_A_NATURAL: Record<string, string> = {
  "Menos de 24 horas": "menos de 24 horas",
  "1-3 días": "1 a 3 días",
  "4-7 días": "4 a 7 días",
  "1-2 semanas": "1 a 2 semanas",
  "Más de 2 semanas": "más de 2 semanas",
  "Más de 1 mes": "más de 1 mes",
};

function limpiar(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/**
 * Transforma el valor crudo de tiempo del triage a lenguaje natural, sin la
 * envoltura "de ... de evolución" (eso lo agrega el bloque de síntomas).
 * Si el valor no está mapeado, lo devuelve tal cual (degradación graceful:
 * el médico nunca ve un placeholder roto, a lo sumo el texto literal del triage).
 * Devuelve "" si no hay plazo.
 */
function plazoNatural(plazo: string | null): string {
  const raw = limpiar(plazo);
  if (!raw) return "";
  return PLAZO_A_NATURAL[raw] ?? raw;
}

/**
 * Une una lista de strings con comas y " y " antes del último.
 * ["a"] → "a" · ["a","b"] → "a y b" · ["a","b","c"] → "a, b y c"
 */
function unirConY(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Asegura que una frase termine en un signo de puntuación de cierre. */
function terminarConPunto(frase: string): string {
  const t = frase.trim();
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

// ---------------------------------------------------------------------------
// Construcción de cada bloque. Cada función devuelve la frase COMPLETA con su
// punto final, o "" si el dato no alcanza para armar la frase.
// ---------------------------------------------------------------------------

function bloqueDemografico(edad: number | null, sexo: DatosEvolucion["sexo"]): string {
  // Apertura tolerante a faltantes: "Paciente de 47 años, masculino." /
  // "Paciente masculino." / "Paciente de 47 años." / "Paciente."
  const tieneEdad = typeof edad === "number" && Number.isFinite(edad) && edad >= 0;
  const tieneSexo = sexo === "masculino" || sexo === "femenino";

  if (tieneEdad && tieneSexo) return `Paciente de ${edad} años, ${sexo}.`;
  if (tieneEdad) return `Paciente de ${edad} años.`;
  if (tieneSexo) return `Paciente ${sexo}.`;
  return "Paciente.";
}

function bloqueMotivo(motivo: string | null): string {
  const m = limpiar(motivo);
  return m ? `Consulta por ${m}.` : "";
}

function bloqueSintomas(sintomas: string[] | null, plazo: string | null): string {
  // Filtrar "Otro" (el motivo libre ya lo cubre) y vacíos.
  const lista = (sintomas ?? [])
    .map((s) => limpiar(s))
    .filter((s) => s.length > 0 && s.toLowerCase() !== "otro");

  if (lista.length === 0) return "";

  // Síntomas en minúscula inicial para que fluyan en la prosa de la frase.
  const frase = unirConY(lista.map(minusculaInicial));
  const cola = plazoNatural(plazo);

  return cola
    ? `Refiere ${frase} de ${cola} de evolución.`
    : `Refiere ${frase}.`;
}

function bloqueDiagnostico(diagnostico: string | null): string {
  const d = limpiar(diagnostico);
  // Dos puntos. NO tocar la capitalización de lo que escribió el médico.
  return d ? terminarConPunto(`Diagnóstico: ${d}`) : "";
}

function bloqueIndicaciones(indicaciones: string | null): string {
  const i = limpiar(indicaciones);
  return i ? terminarConPunto(`Se indica ${i}`) : "";
}

function bloqueReceta(receta: string | null): string {
  const r = limpiar(receta);
  // "Se prescribe" (preferido sobre "Se receta"). La receta ya viene serializada.
  return r ? terminarConPunto(`Se prescribe ${r}`) : "";
}

function bloqueComentario(comentario: string | null): string {
  const c = limpiar(comentario);
  // Sin rótulo "Comentarios adicionales:" — se concatena como una frase más.
  return c ? terminarConPunto(c) : "";
}

/**
 * minusculaInicial — baja SOLO la primera letra, dejando el resto intacto.
 * Los síntomas del triage vienen capitalizados ("Dolor de garganta") y queremos
 * que fluyan en prosa ("refiere dolor de garganta"). No tocamos siglas internas.
 */
function minusculaInicial(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Compone el texto de la evolución a partir de datos ya cargados por humanos.
 * Determinística, pura, sin IO. Los bloques sin dato se omiten por completo.
 * Nunca devuelve frases colgadas ("Se indica .") ni inventa contenido.
 */
export function componerEvolucion(datos: DatosEvolucion): string {
  const frases = [
    bloqueDemografico(datos.edad, datos.sexo),
    bloqueMotivo(datos.motivo),
    bloqueSintomas(datos.sintomas, datos.plazo),
    bloqueDiagnostico(datos.diagnostico),
    bloqueIndicaciones(datos.indicaciones),
    bloqueReceta(datos.receta),
    bloqueComentario(datos.comentario),
  ].filter((f) => f.length > 0);

  return frases.join(" ");
}
