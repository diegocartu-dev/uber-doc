import { calcularCuil } from "../../src/lib/cuil";

const cases: Array<{ dni: string; sexo: "masculino" | "femenino"; expected: string; label: string }> = [
  // Verificados manualmente con algoritmo CUIL estándar (pesos 5,4,3,2,7,6,5,4,3,2)
  { dni: "12345678", sexo: "masculino", expected: "20123456786", label: "hombre estándar" },
  { dni: "12345678", sexo: "femenino", expected: "27123456780", label: "mujer estándar" },
  { dni: "33456789", sexo: "masculino", expected: "20334567894", label: "DNI 33M" },
  { dni: "11111111", sexo: "masculino", expected: "20111111112", label: "DNI repetido hombre" },
  { dni: "11111111", sexo: "femenino", expected: "27111111117", label: "DNI repetido mujer" },
  { dni: "8234567", sexo: "masculino", expected: "20082345672", label: "DNI 7 dígitos con padding" },
  // Caso especial: mod=1 → prefijo 23
  { dni: "00000001", sexo: "masculino", expected: "23000000019", label: "prefijo 23 por mod=1" },
];

let passed = 0;
let failed = 0;

for (const { dni, sexo, expected, label } of cases) {
  const result = calcularCuil(dni, sexo);
  if (result === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} — calcularCuil("${dni}", "${sexo}") = "${result}", expected "${expected}"`);
  }
}

// Test DNI inválido (más de 8 dígitos)
try {
  calcularCuil("123456789", "masculino");
  failed++;
  console.error("FAIL: debería lanzar error para DNI de 9 dígitos");
} catch {
  passed++;
}

// Test formato con puntos
const conPuntos = calcularCuil("12.345.678", "masculino");
if (conPuntos === "20123456786") {
  passed++;
} else {
  failed++;
  console.error(`FAIL: DNI con puntos — got "${conPuntos}", expected "20123456786"`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
