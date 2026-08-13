// scripts/pdf-golden-huellas.mts — imprime las huellas del GOLDEN del PDF.
//
// Se corre a mano, NUNCA en el CI:
//     npx tsx scripts/pdf-golden-huellas.mts
//
// Sirve para dos cosas y solo dos:
//   1. Sellar las huellas la primera vez (así se armaron las de
//      `src/lib/pdf/receta-golden.test.ts`, corriendo esto sobre el generador
//      de `main` ANTES de tocarlo).
//   2. Re-sellarlas el día que el papel del B2C cambie A PROPÓSITO — con la
//      aprobación correspondiente, porque este documento tiene validez legal.
//
// Si el golden falla y nadie decidió cambiar el papel, la respuesta NO es
// correr este script: es arreglar la regresión.

import { generarRecetaPDF } from "../src/lib/pdf/receta";
import { FIXTURES, huellaPDF } from "../src/lib/pdf/receta-golden.fixtures";

for (const f of FIXTURES) {
  const pdf = await generarRecetaPDF(f.doc);
  console.log(`${huellaPDF(pdf)}  ${f.nombre}  (${pdf.length} bytes)`);
}
