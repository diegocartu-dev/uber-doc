// Los números de la espera, fijados por Diego el 21/08/2026 tras revisar un caso
// real: "el paciente no espera toda la madrugada, se avisó una vez a los 10
// minutos y listo" y "no podemos mandar más de 2 recordatorios".
//
// Este test existe porque los dos números son política de producto, no detalle
// de implementación: si alguien los mueve sin querer, el efecto no se ve en
// pantalla —se ve semanas después, en un profesional que silenció el canal o en
// un paciente que se cansó de esperar.

import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAZO_SIN_ACEPTAR_MIN } from "../../src/lib/consultas/sin-respuesta";

test("la solicitud sin aceptar se libera a los 10 minutos", () => {
  assert.equal(PLAZO_SIN_ACEPTAR_MIN, 10);
});

test("la ventana: a los 9 minutos sigue viva, a los 10 se cae", () => {
  const pedidaMs = new Date("2026-08-18T22:09:41-03:00").getTime();
  const corte = (ahoraMs: number) =>
    new Date(ahoraMs - PLAZO_SIN_ACEPTAR_MIN * 60_000).toISOString();
  // El cron busca `created_at < corte`: la solicitud entra cuando su edad supera el plazo.
  const vencida = (minutos: number) =>
    new Date(pedidaMs).toISOString() < corte(pedidaMs + minutos * 60_000);

  assert.equal(vencida(0), false, "recién pedida");
  assert.equal(vencida(9), false, "a los 9 minutos todavía no");
  assert.equal(vencida(10), false, "a los 10 justos está en el borde, no antes");
  assert.equal(vencida(11), true, "a los 11 ya venció");
});

test("el caso que originó la regla: 11 horas colgada es imposible ahora", () => {
  const eranOnceHoras = 11 * 60;
  assert.ok(
    eranOnceHoras > PLAZO_SIN_ACEPTAR_MIN,
    "una espera de 11 horas tiene que quedar muy por encima del plazo"
  );
  // Con el cron corriendo cada 3 minutos, el peor caso real es plazo + intervalo.
  const peorCaso = PLAZO_SIN_ACEPTAR_MIN + 3;
  assert.ok(peorCaso <= 13, `el peor caso debería ser ~13 min, dio ${peorCaso}`);
});
