// CUIL — fuente única de verdad.
//
// El CUIL de una persona física es DERIVABLE: prefijo por sexo + DNI + dígito
// verificador. No hay nada que "cargar": si tenemos DNI y sexo, lo calculamos.
// Esta es la única implementación del algoritmo en el repo. Antes había tres
// (esta, una copiada en `onboarding/actions.ts` y otra en
// `api/paciente/perfil-medico/route.ts`) y las tres estaban mal, cada una
// distinto — ver la nota del caso especial más abajo.

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

function resto(base: string): number {
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += Number(base[i]) * PESOS[i];
  }
  return suma % 11;
}

function digitoVerificador(base: string): number {
  const r = resto(base);
  return r === 0 ? 0 : 11 - r;
}

/**
 * Calcula el CUIL de una persona física a partir de su DNI y su sexo registral.
 * Devuelve los 11 dígitos sin separadores. Lanza si el DNI no es utilizable.
 *
 * CASO ESPECIAL (el que estaba mal en las tres implementaciones anteriores):
 * cuando el resto de la suma ponderada es 1, el dígito verificador daría 10 —
 * que no es un dígito. La regla de ANSES es cambiar el prefijo a 23 y recalcular
 * sobre esa nueva base. El disparador es `resto === 1`, NO "el dígito dio 9":
 * un resto de 2 produce un 9 perfectamente legítimo (11 - 2), y tratarlo como
 * caso especial le inventaba un prefijo 23 a ~1 de cada 11 personas.
 */
export function calcularCuil(dni: string, sexo: "masculino" | "femenino"): string {
  const digitos = dni.replace(/\D/g, "");
  if (digitos.length < 1 || digitos.length > 8) {
    throw new Error(`DNI inválido: ${dni}`);
  }
  const padded = digitos.padStart(8, "0");
  const prefijo = sexo === "masculino" ? "20" : "27";

  if (resto(prefijo + padded) === 1) {
    // Prefijo 23 para ambos sexos. La copia de `onboarding` devolvía 27 acá
    // para las mujeres: un CUIL que no valida contra ningún padrón.
    return `23${padded}${digitoVerificador("23" + padded)}`;
  }

  return `${prefijo}${padded}${digitoVerificador(prefijo + padded)}`;
}

/** `20123456786` → `20-12345678-6`. Es el formato que guarda la base. */
export function formatearCuil(cuil: string): string {
  const d = cuil.replace(/\D/g, "");
  if (d.length !== 11) return cuil;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/**
 * Versión segura para llamar con datos crudos de la base: nunca lanza y devuelve
 * el CUIL ya formateado con guiones, o `null` si el DNI o el sexo no alcanzan.
 */
export function calcularCuilFormateado(
  dni: string | null | undefined,
  sexo: string | null | undefined
): string | null {
  if (!dni || (sexo !== "masculino" && sexo !== "femenino")) return null;
  try {
    return formatearCuil(calcularCuil(dni, sexo));
  } catch {
    return null;
  }
}

/**
 * El CUIL a mostrar/imprimir para un paciente: el guardado si lo hay, y si no el
 * derivado de DNI + sexo. Devuelve "" cuando no se puede saber.
 *
 * Por qué existe: el CUIL vivía SOLO como columna, y esa columna se llenaba en
 * dos momentos puntuales del alta. Un paciente que llegaba por cualquier otro
 * camino quedaba sin CUIL para siempre, aunque tuviéramos su DNI y su sexo al
 * lado. Usar esto en vez de leer `pacientes.cuil` a pelo hace que ese agujero
 * deje de existir: si el dato es derivable, se deriva en el momento.
 */
export function cuilDePaciente(paciente: {
  cuil?: string | null;
  dni?: string | null;
  sexo_dni?: string | null;
}): string {
  const guardado = paciente.cuil?.trim();
  if (guardado) return guardado;
  return calcularCuilFormateado(paciente.dni, paciente.sexo_dni) ?? "";
}
