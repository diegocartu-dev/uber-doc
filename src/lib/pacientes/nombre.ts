// Nombre y apellido del paciente — composición, partición y la regla de
// "está completo".
//
// Hasta el 22/08/2026 el registro, el onboarding y "Mis datos" pedían UN campo,
// "Nombre completo", y validaban solo que no estuviera vacío. Una paciente se
// registró con su nombre de pila, y los tres documentos de su consulta salieron
// sin apellido — sellados así, porque la identidad impresa se congela al firmar
// (src/lib/firma/identidad.ts). Nadie la frenó antes, y después ya era tarde.
//
// `nombre_completo` sigue siendo la columna que leen documentos, listados y
// mails. Lo que cambia es quién la escribe: los formularios piden nombre y
// apellido por separado y guardan los tres. Así cada lector existente toma
// ambos sin tocar un SELECT en producción.

import { capitalizarNombre } from "@/lib/utils/texto";

function limpiar(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\s+/g, " ").trim();
}

/** "Nombre Apellido", sin dobles espacios. Vacío si no hay nada. */
export function componerNombreCompleto(nombre: string, apellido: string): string {
  return [limpiar(nombre), limpiar(apellido)].filter(Boolean).join(" ");
}

/**
 * Partición para PREFILLEAR solamente — primera palabra → nombre, el resto →
 * apellido. Nunca se escribe en la base sin que la persona lo confirme: no hay
 * forma de saber si "María Belén Pérez" es nombre compuesto o apellido doble.
 */
export function separarNombreCompleto(
  nombreCompleto: string | null | undefined
): { nombre: string; apellido: string } {
  const partes = limpiar(nombreCompleto).split(" ").filter(Boolean);
  if (partes.length === 0) return { nombre: "", apellido: "" };
  if (partes.length === 1) return { nombre: partes[0], apellido: "" };
  return { nombre: partes[0], apellido: partes.slice(1).join(" ") };
}

/** Lo que se guarda: cada parte capitalizada y el compuesto. */
export function normalizarNombreApellido(
  nombre: string,
  apellido: string
): { nombre: string; apellido: string; nombre_completo: string } {
  const n = capitalizarNombre(limpiar(nombre));
  const a = capitalizarNombre(limpiar(apellido));
  return { nombre: n, apellido: a, nombre_completo: componerNombreCompleto(n, a) };
}

/**
 * ¿La ficha tiene nombre Y apellido? Es la regla del gate previo a la consulta
 * ("Tu información médica"): sin esto no se entra, porque de acá sale lo que se
 * imprime y se sella.
 *
 * - Fila nueva: nombre y apellido cargados.
 * - Fila anterior al 23/08/2026 (nombre/apellido en NULL): se acepta un
 *   nombre_completo de al menos dos palabras. Una sola palabra → incompleto, y
 *   el onboarding lo pide bien antes de dejar pasar.
 */
export function tieneNombreYApellido(p: {
  nombre?: string | null;
  apellido?: string | null;
  nombre_completo?: string | null;
}): boolean {
  if (limpiar(p.nombre) && limpiar(p.apellido)) return true;
  return limpiar(p.nombre_completo).split(" ").filter(Boolean).length >= 2;
}
