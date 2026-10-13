// El texto del término de controlados que se muestra y el que quedó sembrado
// en la base tienen que ser el mismo: la aceptación prueba que alguien tildó ESE
// texto. Si alguien cambia el de la pantalla sin sembrar una versión nueva, la
// fila diría que aceptó algo que no vio.
// Ejecutar:  npx tsx --test src/lib/legal/controlados.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTROLADOS_TEXTO_COMPLETO,
  CONTROLADOS_TEXTO,
  CONTROLADOS_VERSION,
} from "./controlados-texto";

const raiz = join(__dirname, "..", "..", "..");
const sembrado = (archivo: string) => readFileSync(join(raiz, archivo), "utf8");
const comoLiteralSql = CONTROLADOS_TEXTO_COMPLETO.replace(/\n/g, "\\n");

for (const archivo of [
  "supabase/migrations/20261012_termino_controlados.sql",
  "supabase/migrations-institucional/035_termino_controlados.sql",
]) {
  test(`${archivo}: siembra el mismo texto y la misma versión que muestra la pantalla`, () => {
    const sql = sembrado(archivo);
    assert.ok(sql.includes(`E'${comoLiteralSql}'`), "el texto sembrado no coincide con CONTROLADOS_TEXTO_COMPLETO");
    assert.ok(sql.includes(`'${CONTROLADOS_VERSION}'`), "la versión sembrada no coincide con CONTROLADOS_VERSION");
  });
}

test("la limitación es solo psicotrópicos y estupefacientes (los antibióticos no entran)", () => {
  assert.match(CONTROLADOS_TEXTO, /psicotrópicos y estupefacientes/);
  assert.doesNotMatch(CONTROLADOS_TEXTO, /antibi/i);
});
