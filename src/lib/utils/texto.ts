/**
 * Capitaliza cada palabra de un nombre propio.
 * Respeta prefijos médicos: "Dr." y "Dra." quedan como están.
 * Ejemplos:
 *   "juan pérez"       → "Juan Pérez"
 *   "dr. carlos lópez" → "Dr. Carlos López"
 *   "MARÍA ELENA"      → "María Elena"
 *   "dra. ANA García"  → "Dra. Ana García"
 */
export function capitalizarNombre(texto: string): string {
  if (!texto) return "";
  return texto
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(" ");
}

/**
 * Formatea el nombre de un médico con su título profesional.
 *
 * EL TÍTULO LO ELIGE EL MÉDICO EN SU REGISTRO y vive en `medicos.titulo`
 * ("Dr." o "Dra."). Hay que PASARLO. Cuando no se pasa, esta función devuelve
 * el nombre pelado: no inventa ninguno.
 *
 * Por qué: hasta el 09/08/2026 el default era "Dr." fijo, y como casi ninguna
 * pantalla pasaba el título, la plataforma le decía "Dr." a 30 de las 36
 * médicas aprobadas — en el link de su consultorio, en la clínica donde el
 * paciente la elige, en los mails y en la receta que firma. El dato estaba bien
 * guardado desde el registro; lo que faltaba era usarlo. Un nombre sin título es
 * neutro; un título equivocado es un error con nombre y apellido.
 *
 * Si el nombre YA viene con "Dr."/"Dra." adentro, se respeta y no se duplica.
 *
 * Ejemplos:
 *   formatNombreMedico("Ana García", "Dra.")     → "Dra. Ana García"
 *   formatNombreMedico("Carlos López", "Dr.")    → "Dr. Carlos López"
 *   formatNombreMedico("Ana García")             → "Ana García"     ← sin inventar
 *   formatNombreMedico("Dra. Ana García")        → "Dra. Ana García"
 */
export function formatNombreMedico(nombre: string, titulo?: string | null): string {
  if (!nombre) return "";
  const trimmed = nombre.trim();
  // El punto es OPCIONAL a propósito: hay fichas cargadas como "Dr Pedro Ruiz",
  // sin punto, y con el guard viejo (que lo exigía) salían duplicadas —
  // "Dr. Dr Pedro Ruiz"— en la caja PROFESIONAL de la receta y en los mails.
  // Ojo: "Drago Pérez" NO matchea, porque después del prefijo se exige un espacio.
  if (/^Dra?\.?\s/i.test(trimmed)) return capitalizarNombre(trimmed);
  if (/^Dra?\./i.test(trimmed)) return capitalizarNombre(trimmed.replace(/^(Dra?\.)/i, "$1 "));
  const prefijo = (titulo ?? "").trim();
  return prefijo ? `${prefijo} ${capitalizarNombre(trimmed)}` : capitalizarNombre(trimmed);
}

/**
 * Artículo que acompaña al título, para el copy que lo necesita
 * ("tu turno con **la** Dra. García", "**el** Dr. López te espera").
 *
 * Sin título conocido devuelve cadena vacía: la frase queda "tu turno con Ana
 * García", que es correcta en vez de arriesgar un "el" equivocado. Ojo al
 * armarla: hay que contemplar el espacio, `${articuloMedico(t)}${...}` con el
 * espacio adentro del helper no sirve para el arranque de una oración.
 */
export function articuloMedico(titulo?: string | null): "el" | "la" | "" {
  const t = (titulo ?? "").trim().toLowerCase();
  if (t.startsWith("dra")) return "la";
  if (t.startsWith("dr")) return "el";
  return "";
}
