// La versión del consentimiento sale de la profesión, y de ningún otro lado.
// Ejecutar:  npx tsx --test src/lib/legal/consentimiento-version.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { versionConsentimiento, esVersionConsentimientoValida } from "./consentimiento-version";

test("médico (o sin dato) → v1; psicólogo → psi-v1", () => {
  assert.equal(versionConsentimiento("medico"), "v1");
  assert.equal(versionConsentimiento(null), "v1");
  assert.equal(versionConsentimiento(undefined), "v1");
  assert.equal(versionConsentimiento("psicologo"), "psi-v1");
});

test("solo se aceptan las versiones conocidas", () => {
  assert.equal(esVersionConsentimientoValida("v1"), true);
  assert.equal(esVersionConsentimientoValida("psi-v1"), true);
  assert.equal(esVersionConsentimientoValida("v2"), false);
  assert.equal(esVersionConsentimientoValida(null), false);
});
