#!/usr/bin/env node
// scripts/test-unit.mjs — corre TODOS los tests unitarios del repo.
//
// ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
// Los tests unitarios estaban escritos pero no los corría nadie: `npm test` es
// `playwright test`, `playwright.config.ts` apunta a `tests/e2e` y el workflow
// del CI ejecuta solo `--project=chromium`. Los archivos de `src/**/*.test.ts`
// y `tests/unit/**` solo corrían si alguien tipeaba el comando a mano — o sea
// que un golden test que dice "esto rompe antes de llegar a producción" no
// rompía nada: un gate escrito al revés mergeaba en verde.
//
// El descubrimiento de archivos se hace acá, en Node, y no con un glob en el
// package.json: `npm` corre los scripts con `sh`, donde `**` no expande, y el
// soporte de globs del runner de `node --test` depende de la versión de Node
// (el CI usa 20). Un walk de tres directorios es aburrido y funciona siempre.
//
// Conviven dos estilos de test y los dos andan bajo `--test`: los nuevos usan
// `node:test` + `node:assert`, y los de `tests/unit/` son scripts que cuentan a
// mano y hacen `process.exit(1)` — el runner los toma como archivo fallado.

import { readdirSync, statSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIRECTORIOS = ["src", "tests/unit"];
const IGNORAR = new Set(["node_modules", ".next", "tests/e2e"]);

function buscarTests(dir) {
  if (!existsSync(dir)) return [];
  const encontrados = [];
  for (const entrada of readdirSync(dir)) {
    if (IGNORAR.has(entrada)) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      encontrados.push(...buscarTests(ruta));
    } else if (entrada.endsWith(".test.ts")) {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

const archivos = DIRECTORIOS.flatMap((d) => buscarTests(join(raiz, d))).sort();

if (archivos.length === 0) {
  console.error("No se encontró ningún archivo *.test.ts. ¿Se movieron de lugar?");
  process.exit(1);
}

console.log(`Corriendo ${archivos.length} archivos de test unitario…`);
const { status } = spawnSync(
  process.execPath,
  [join(raiz, "node_modules", "tsx", "dist", "cli.mjs"), "--test", ...archivos],
  { stdio: "inherit", cwd: raiz }
);
process.exit(status ?? 1);
