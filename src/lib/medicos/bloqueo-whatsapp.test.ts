// Solo se bloquea cuando WhatsApp dice que el número no puede recibir mensajes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { esDestinatarioInvalido, motivoDeCodigo } from "./bloqueo-whatsapp";

test("bloquean los errores de destinatario inválido; un corte o un aviso demorado, no", () => {
  for (const c of ["63024", "63003", "21211", "21614"]) assert.equal(esDestinatarioInvalido(c), true);
  for (const c of [null, undefined, "", "30003", "30008", "63016"]) assert.equal(esDestinatarioInvalido(c), false);
});

test("el motivo se le explica al profesional en criollo", () => {
  assert.match(motivoDeCodigo("63024"), /no tiene WhatsApp activo/);
  assert.match(motivoDeCodigo("21614"), /no es un celular/);
});
