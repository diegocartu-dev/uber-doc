// Verifica la integridad del manual ilustrado de Nova:
//  - ids únicos
//  - cada imagen referenciada (pasos + ampliaciones) existe en /public
//  - paths bajo /nova/manual/
//  - 3–6 pasos por cuentito (recomendación)
//
// Uso: npx tsx scripts/verify-manual-imagenes.ts
// Correr post-cambios en el registro o tras agregar/renombrar fotos.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { FUNCIONES_AYUDA } from "../src/lib/nova/manual/funciones-ayuda";

let errores = 0;
const ids = new Set<string>();

for (const fn of FUNCIONES_AYUDA) {
  if (ids.has(fn.id)) {
    console.error(`✗ id duplicado: ${fn.id}`);
    errores++;
  }
  ids.add(fn.id);

  if (fn.pasos.length < 3 || fn.pasos.length > 6) {
    console.warn(`⚠ [${fn.id}] ${fn.pasos.length} pasos (recomendado 3–6)`);
  }

  const imagenes = [
    ...fn.pasos.map((p) => p.imagen),
    ...fn.pasos.flatMap((p) => (p.ampliacion?.imagen ? [p.ampliacion.imagen] : [])),
  ];

  for (const img of imagenes) {
    if (!img.startsWith("/nova/manual/")) {
      console.error(`✗ [${fn.id}] path inesperado (debe empezar con /nova/manual/): ${img}`);
      errores++;
      continue;
    }
    const abs = join(process.cwd(), "public", img);
    if (!existsSync(abs)) {
      console.error(`✗ [${fn.id}] falta la imagen: public${img}`);
      errores++;
    }
  }

  // El cuentito encadenado, si está declarado, debe existir
  const sig = fn.cierre.siguiente;
  if (sig && !FUNCIONES_AYUDA.some((f) => f.id === sig.funcionId)) {
    console.warn(`⚠ [${fn.id}] encadena a "${sig.funcionId}" que aún no existe (el botón no se mostrará).`);
  }
}

if (errores > 0) {
  console.error(`\n${errores} error(es) de integridad del manual.`);
  process.exit(1);
}

console.log(
  `✓ Manual OK: ${FUNCIONES_AYUDA.length} cuentito(s), ids únicos, todas las imágenes existen.`
);
