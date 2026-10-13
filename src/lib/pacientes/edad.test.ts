// Ejecutar:  npx tsx --test src/lib/pacientes/edad.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { edadEnAnios, esMenorDeEdad } from "./edad";

test("años cumplidos: el día del cumpleaños ya cuenta", () => {
  assert.equal(edadEnAnios("2008-10-13", "2026-10-13"), 18);
  assert.equal(edadEnAnios("2008-10-14", "2026-10-13"), 17);
  assert.equal(edadEnAnios("2008-11-01", "2026-10-13"), 17);
  assert.equal(edadEnAnios("1950-01-01T00:00:00Z", "2026-10-13"), 76);
});

test("menor de edad: menos de 18; sin dato o dato roto no es menor", () => {
  assert.equal(esMenorDeEdad("2008-10-14", "2026-10-13"), true);
  assert.equal(esMenorDeEdad("2008-10-13", "2026-10-13"), false);
  assert.equal(esMenorDeEdad(null, "2026-10-13"), false);
  assert.equal(esMenorDeEdad("13/10/2008", "2026-10-13"), false);
  assert.equal(esMenorDeEdad("2030-01-01", "2026-10-13"), false);
});
