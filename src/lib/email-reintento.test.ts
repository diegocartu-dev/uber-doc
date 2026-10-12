// El reintento de los mails tiene que leer el error que DEVUELVE Resend.
// Ejecutar:  npx tsx --test src/lib/email-reintento.test.ts
//
// El SDK de Resend no lanza excepciones: un rechazo vuelve como
// `{ data: null, error }`. Hasta el 12/10/2026 `conRetry` solo miraba
// excepciones, así que no reintentaba nunca y un mail rechazado quedaba
// logueado como "enviado".
import { test } from "node:test";
import assert from "node:assert/strict";
import { conRetry } from "./email";

test("un 5xx devuelto por Resend se reintenta y, si el segundo sale, vale", async () => {
  let llamadas = 0;
  const r = await conRetry(async () => {
    llamadas++;
    return llamadas === 1
      ? { data: null, error: { message: "caída", statusCode: 503 } }
      : { data: { id: "x" }, error: null };
  }, "prueba");
  assert.equal(llamadas, 2);
  assert.deepEqual(r, { data: { id: "x" }, error: null });
});

test("sin respuesta de Resend (statusCode null) también se reintenta", async () => {
  let llamadas = 0;
  await assert.rejects(
    conRetry(async () => {
      llamadas++;
      return { data: null, error: { message: "Unable to fetch data", statusCode: null } };
    }, "prueba")
  );
  assert.equal(llamadas, 2);
});

test("un 4xx devuelto por Resend no se reintenta y falla (no se cuenta como enviado)", async () => {
  let llamadas = 0;
  await assert.rejects(
    conRetry(async () => {
      llamadas++;
      return { data: null, error: { message: "dirección inválida", statusCode: 422 } };
    }, "prueba"),
    /dirección inválida/
  );
  assert.equal(llamadas, 1);
});

test("un envío aceptado pasa directo", async () => {
  let llamadas = 0;
  await conRetry(async () => {
    llamadas++;
    return { data: { id: "x" }, error: null };
  }, "prueba");
  assert.equal(llamadas, 1);
});
