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
//
// ── CORRELO CON EL NODE DEL CI ───────────────────────────────────────────────
// La versión está en `.nvmrc` (hoy 20) y es la que usa el workflow. Las huellas
// son PORTABLES entre versiones —`huellaPDF` infla los streams justamente para
// eso, ver `normalizarStreams` en las fixtures— pero el día que alguien toque
// esa normalización, el número de acá y el del CI tienen que ser el mismo.
//
// El motivo: la salida de deflate depende de la versión de zlib que trae Node.
// Medido: Node 20.19 embebe zlib 1.3.0.1-motley y Node 25.8 embebe 1.2.12, y el
// MISMO PDF pesa ~3 KB distinto según cuál lo generó. Cuando la huella hasheaba
// los bytes comprimidos, sellarla en una máquina de desarrollo ponía en rojo
// TODOS los PRs a main con un falso "el papel cambió" — y el arreglo tentador
// (re-sellar el hash) destruye la garantía en silencio.
//
// ── Y SIEMPRE SOBRE `origin/main` ────────────────────────────────────────────
// Las huellas fijan el papel de main, no una foto de la rama. Para re-sellarlas:
//     git worktree add --detach /tmp/main-limpio origin/main
//     cp src/lib/pdf/receta-golden.fixtures.ts /tmp/main-limpio/src/lib/pdf/
//     cd /tmp/main-limpio && npx tsx scripts/pdf-golden-huellas.mts

import { generarRecetaPDF } from "../src/lib/pdf/receta";
import { FIXTURES, huellaPDF } from "../src/lib/pdf/receta-golden.fixtures";

for (const f of FIXTURES) {
  const pdf = await generarRecetaPDF(f.doc);
  console.log(`${huellaPDF(pdf)}  ${f.nombre}  (${pdf.length} bytes)`);
}
