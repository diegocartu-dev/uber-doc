// Edad del paciente, para la regla "psicología, solo adultos" (Diego, 13/10/2026).
//
// Límite declarado: la fecha de nacimiento la escribe el paciente y no se
// verifica. Un menor que mienta pasa; esto frena al que dice la verdad y a la
// cuenta que un padre arma para su hijo con los datos del hijo.

/** Años cumplidos el día `hoy` ("YYYY-MM-DD", hora argentina). `null` si la fecha no se entiende. */
export function edadEnAnios(fechaNacimiento: string | null | undefined, hoy: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaNacimiento ?? "");
  const h = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoy);
  if (!m || !h) return null;
  const [an, mn, dn] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [ah, mh, dh] = [Number(h[1]), Number(h[2]), Number(h[3])];
  if (mn < 1 || mn > 12 || dn < 1 || dn > 31) return null;
  let edad = ah - an;
  if (mh < mn || (mh === mn && dh < dn)) edad -= 1;
  return edad >= 0 && edad < 130 ? edad : null;
}

export const EDAD_ADULTA = 18;

/**
 * ¿Es menor de edad? `false` si la fecha falta o no se entiende: sin dato no se
 * le niega la atención a nadie (el registro de paciente pide la fecha).
 */
export function esMenorDeEdad(fechaNacimiento: string | null | undefined, hoy: string): boolean {
  const edad = edadEnAnios(fechaNacimiento, hoy);
  return edad !== null && edad < EDAD_ADULTA;
}
