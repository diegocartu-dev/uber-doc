// Lo que le mandamos a Mercado Pago del pagador: completo cuando se sabe, nunca inventado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { armarPagador, identificacion, nombreYApellido, telefonoMp } from "./preferencia-mp";

test("nombre y apellido: campos separados primero; si no, el nombre completo partido", () => {
  assert.deepEqual(nombreYApellido({ email: "x", nombre: "Ana", apellido: "Pérez" }), { name: "Ana", surname: "Pérez" });
  assert.deepEqual(nombreYApellido({ email: "x", nombre_completo: "Ana María Pérez" }), { name: "Ana", surname: "María Pérez" });
  assert.deepEqual(nombreYApellido({ email: "x", nombre_completo: "Ana" }), { name: "Ana" });
  assert.deepEqual(nombreYApellido({ email: "x", nombre_completo: "  " }), {});
});

test("DNI: solo 7 u 8 dígitos; con puntos se limpia; otra cosa no se manda", () => {
  assert.deepEqual(identificacion("30.123.456"), { type: "DNI", number: "30123456" });
  assert.deepEqual(identificacion("3012345"), { type: "DNI", number: "3012345" });
  assert.equal(identificacion("123"), undefined);
  assert.equal(identificacion(null), undefined);
});

test("teléfono: E.164 argentino o 10 dígitos → área + número, sin 9 ni 15", () => {
  assert.deepEqual(telefonoMp("+5491140289141"), { area_code: "11", number: "40289141" });
  assert.deepEqual(telefonoMp("1140289141"), { area_code: "11", number: "40289141" });
  assert.deepEqual(telefonoMp("+543514567890"), { area_code: "351", number: "4567890" });
  assert.equal(telefonoMp("123"), undefined);
  assert.equal(telefonoMp(null), undefined);
});

test("el pagador lleva solo lo que se sabe", () => {
  assert.deepEqual(armarPagador({ email: " ana@ejemplo.test ", nombre_completo: "Ana Pérez", dni: "30123456", telefono: "+5491140289141" }), {
    email: "ana@ejemplo.test",
    name: "Ana",
    surname: "Pérez",
    identification: { type: "DNI", number: "30123456" },
    phone: { area_code: "11", number: "40289141" },
  });
  assert.deepEqual(armarPagador({ email: null }), {});
});
