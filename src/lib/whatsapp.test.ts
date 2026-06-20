// Tests de normalizarTelefonoAR — runner: node:test + node:assert, corridos con tsx.
// Ejecutar:  npx tsx --test src/lib/whatsapp.test.ts
//
// Objetivo: fijar la normalización a E.164 móvil argentino (+549 + 10 dígitos),
// en especial el manejo del viejo prefijo "15" embebido y el rechazo de basura.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarTelefonoAR } from "./whatsapp";

test("móvil limpio de 10 dígitos (CABA)", () => {
  assert.equal(normalizarTelefonoAR("1173621861"), "+5491173621861");
});

test("móvil limpio de 10 dígitos (interior, área 4)", () => {
  assert.equal(normalizarTelefonoAR("3414377620"), "+5493414377620");
  assert.equal(normalizarTelefonoAR("2954123456"), "+5492954123456");
});

test("formato E.164 con espacios y 9 de móvil", () => {
  assert.equal(normalizarTelefonoAR("+54 9 11 7362 1861"), "+5491173621861");
});

test("ya en formato 54 9 ... sin +", () => {
  assert.equal(normalizarTelefonoAR("5491173621861"), "+5491173621861");
});

test("viejo prefijo 15 — CABA (área 2): NO debe quedar el 15", () => {
  assert.equal(normalizarTelefonoAR("011 15 1234 5678"), "+5491112345678");
  assert.equal(normalizarTelefonoAR("11 15 2345 6789"), "+5491123456789");
});

test("viejo prefijo 15 — interior (área 3): NO debe quedar el 15", () => {
  assert.equal(normalizarTelefonoAR("351 15 234 5678"), "+5493512345678");
});

test("rechaza (null) lo que no queda en 10 dígitos", () => {
  assert.equal(normalizarTelefonoAR("11432132112"), null); // 11 dígitos
  assert.equal(normalizarTelefonoAR("123"), null);
});

test("rechaza vacío / null / undefined", () => {
  assert.equal(normalizarTelefonoAR(""), null);
  assert.equal(normalizarTelefonoAR(null), null);
  assert.equal(normalizarTelefonoAR(undefined), null);
});

test("ignora texto no numérico alrededor", () => {
  assert.equal(normalizarTelefonoAR("Cel: 11 7362-1861"), "+5491173621861");
});
