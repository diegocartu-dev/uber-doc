// La versión del consentimiento sale de la profesión, y de ningún otro lado.
// Ejecutar:  npx tsx --test src/lib/legal/consentimiento-version.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
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

// El texto de cada versión queda fijado (13/10/2026): `texto_version` es la
// prueba de QUÉ leyó el paciente, y el texto vive solo en el componente. Si el
// texto cambia y la versión no, dos registros iguales apuntan a dos textos
// distintos. Este test obliga a decidirlo: o se sube la versión (y la nueva
// entra acá), o Diego decide no subirla, se actualiza la huella y se anota en
// DECISIONES.md con la fecha. Historia: "v1" tiene dos redacciones, la del
// 20/05/2026 y la del 13/10/2026 (sumó "o al servicio de emergencias de tu
// zona", sin subir versión: es una opción más para el paciente, no una menos).

function huellas() {
  const fuente = readFileSync(resolve(__dirname, "../../components/ConsentimientoInformado.tsx"), "utf8");
  const desde = fuente.indexOf("{psicologia ? (\n");
  const medio = fuente.indexOf(") : (", desde);
  const hasta = fuente.indexOf("          )}\n        </div>", medio);
  assert.ok(desde > 0 && medio > desde && hasta > medio, "no encontré los dos textos en ConsentimientoInformado.tsx");
  const huella = (s: string) =>
    createHash("sha256")
      .update(s.split("\n").filter((l) => !/^\s*\/\//.test(l)).join(" ").replace(/\s+/g, " ").trim())
      .digest("hex")
      .slice(0, 16);
  return { "psi-v1": huella(fuente.slice(desde, medio)), v1: huella(fuente.slice(medio, hasta)) };
}

test("el texto de cada versión del consentimiento no cambia sin decidir la versión", () => {
  assert.deepEqual(huellas(), { "psi-v1": "209aae2e64a63a37", v1: "0f4ea3274fd4e189" });
});
