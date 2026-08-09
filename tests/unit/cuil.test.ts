import {
  calcularCuil,
  calcularCuilFormateado,
  cuilDePaciente,
  formatearCuil,
} from "../../src/lib/cuil";

const cases: Array<{ dni: string; sexo: "masculino" | "femenino"; expected: string; label: string }> = [
  // Verificados manualmente con algoritmo CUIL estándar (pesos 5,4,3,2,7,6,5,4,3,2)
  { dni: "12345678", sexo: "masculino", expected: "20123456786", label: "hombre estándar" },
  { dni: "12345678", sexo: "femenino", expected: "27123456780", label: "mujer estándar" },
  { dni: "33456789", sexo: "masculino", expected: "20334567894", label: "DNI 33M" },
  { dni: "11111111", sexo: "masculino", expected: "20111111112", label: "DNI repetido hombre" },
  { dni: "11111111", sexo: "femenino", expected: "27111111117", label: "DNI repetido mujer" },
  { dni: "8234567", sexo: "masculino", expected: "20082345672", label: "DNI 7 dígitos con padding" },

  // Caso especial REAL: resto === 1 → prefijo 23 y se recalcula el verificador.
  { dni: "00000001", sexo: "masculino", expected: "23000000019", label: "prefijo 23 por resto=1 (hombre)" },
  // Este es el que devolvía "27000000094" en las copias de onboarding y
  // perfil-medico: prefijo 27 donde corresponde 23. CUIL inválido.
  { dni: "00000009", sexo: "femenino", expected: "23000000094", label: "prefijo 23 por resto=1 (mujer)" },

  // Y este es el que rompía `lib/cuil.ts`: el verificador da 9 legítimamente
  // (resto = 2 → 11 - 2), NO es el caso especial. Devolvía "23000000043".
  { dni: "00000004", sexo: "femenino", expected: "27000000049", label: "verificador 9 legítimo, sin prefijo 23" },
];

let passed = 0;
let failed = 0;

function check(label: string, got: unknown, expected: unknown) {
  if (got === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} — got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
  }
}

for (const { dni, sexo, expected, label } of cases) {
  check(label, calcularCuil(dni, sexo), expected);
}

// Invariante del algoritmo: el CUIL calculado siempre valida contra su propio
// dígito verificador. Barrido amplio — atrapa cualquier regresión del caso
// especial sin depender de que alguien piense el DNI justo.
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
function esCuilValido(cuil: string): boolean {
  if (!/^\d{11}$/.test(cuil)) return false;
  if (!["20", "23", "24", "27"].includes(cuil.slice(0, 2))) return false;
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(cuil[i]) * PESOS[i];
  const r = suma % 11;
  return Number(cuil[10]) === (r === 0 ? 0 : 11 - r);
}

let invalidos = 0;
for (let dni = 1; dni <= 60000; dni++) {
  for (const sexo of ["masculino", "femenino"] as const) {
    if (!esCuilValido(calcularCuil(String(dni), sexo))) invalidos++;
  }
}
check("120.000 CUILes calculados validan su propio verificador", invalidos, 0);

// DNI inválido (más de 8 dígitos)
try {
  calcularCuil("123456789", "masculino");
  failed++;
  console.error("FAIL: debería lanzar error para DNI de 9 dígitos");
} catch {
  passed++;
}

// Formato con puntos
check("DNI con puntos", calcularCuil("12.345.678", "masculino"), "20123456786");

// --- formatearCuil / calcularCuilFormateado ---
check("formatearCuil", formatearCuil("20123456786"), "20-12345678-6");
check("calcularCuilFormateado", calcularCuilFormateado("12345678", "masculino"), "20-12345678-6");
check("formateado sin sexo", calcularCuilFormateado("12345678", null), null);
check("formateado sin dni", calcularCuilFormateado(null, "masculino"), null);
check("formateado con sexo raro", calcularCuilFormateado("12345678", "otro"), null);
check("formateado con dni imposible", calcularCuilFormateado("123456789", "masculino"), null);

// --- cuilDePaciente: el guardado gana; si no hay, se deriva ---
check(
  "usa el CUIL guardado",
  cuilDePaciente({ cuil: "27-11111111-7", dni: "11111111", sexo_dni: "femenino" }),
  "27-11111111-7"
);
check(
  "deriva cuando no hay guardado",
  cuilDePaciente({ cuil: null, dni: "12345678", sexo_dni: "masculino" }),
  "20-12345678-6"
);
check(
  "deriva cuando el guardado está vacío",
  cuilDePaciente({ cuil: "   ", dni: "12345678", sexo_dni: "femenino" }),
  "27-12345678-0"
);
check("sin datos devuelve vacío", cuilDePaciente({ cuil: null, dni: null, sexo_dni: null }), "");
check(
  "con DNI pero sin sexo devuelve vacío",
  cuilDePaciente({ cuil: null, dni: "12345678", sexo_dni: null }),
  ""
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
