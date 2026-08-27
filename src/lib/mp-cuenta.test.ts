import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoCuentaMp } from "./mp-cuenta";

const enUnAño = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

test("sin cuenta, o revocada, es 'no_conectado'", () => {
  assert.equal(estadoCuentaMp(null), "no_conectado");
  assert.equal(estadoCuentaMp(undefined), "no_conectado");
  // Revocado = sacó la autorización desde MP. Ningún refresh la resucita.
  assert.equal(estadoCuentaMp({ estado: "revocado", expires_at: enUnAño }), "no_conectado");
});

test("activa y vigente es lo único que cobra", () => {
  assert.equal(estadoCuentaMp({ estado: "activo", expires_at: enUnAño }), "conectado");
});

test("EL BUG: activa pero con el permiso vencido NO cobra", () => {
  // Este es el caso que rompía todo. `estado` se queda en 'activo' porque recién
  // pasa a 'expirado' dentro del checkout — con el paciente ya pagando. Mirando
  // solo el estado, el panel pintaba verde y el gate de disponibilidad dejaba
  // publicarse a alguien que no podía cobrar.
  assert.equal(estadoCuentaMp({ estado: "activo", expires_at: ayer }), "expirado");
});

test("ya marcada 'expirado' sigue siendo expirado", () => {
  assert.equal(estadoCuentaMp({ estado: "expirado", expires_at: ayer }), "expirado");
  // Incluso si la fecha quedó en el futuro: el checkout ya la marcó por algo.
  assert.equal(estadoCuentaMp({ estado: "expirado", expires_at: enUnAño }), "expirado");
});

test("sin fecha no se asume que cobra", () => {
  // Fail-closed: una fila sin `expires_at` no puede leerse como vigente.
  assert.equal(estadoCuentaMp({ estado: "activo", expires_at: null }), "expirado");
});
