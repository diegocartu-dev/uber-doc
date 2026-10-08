// La clave VAPID con un salto de línea pegado rompía todos los push (08/10/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import webpush from "web-push";
import { limpiarClaveVapid } from "./push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

test("con el salto de línea pegado, web-push rechaza la clave; limpia, la acepta", () => {
  assert.throws(() => webpush.setVapidDetails("mailto:x@docto.com.ar", publicKey + "\n", privateKey));
  assert.doesNotThrow(() => webpush.setVapidDetails("mailto:x@docto.com.ar", limpiarClaveVapid(publicKey + "\n"), limpiarClaveVapid(privateKey + "\\n")));
});

test("limpiar no toca una clave sana", () => {
  assert.equal(limpiarClaveVapid(publicKey), publicKey);
  assert.equal(limpiarClaveVapid(undefined), "");
});
