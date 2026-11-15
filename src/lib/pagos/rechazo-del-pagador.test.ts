// Qué rechazos de Mercado Pago no le avisan al equipo: solo los del pagador.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rechazoEsDelPagador } from "./rechazo-del-pagador";

test("fondos insuficientes es del pagador: no suena", () => {
  assert.equal(rechazoEsDelPagador("cc_rejected_insufficient_amount"), true);
  assert.equal(rechazoEsDelPagador(" CC_REJECTED_INSUFFICIENT_AMOUNT "), true);
});

test("el antifraude y el resto de los motivos siguen sonando", () => {
  assert.equal(rechazoEsDelPagador("cc_rejected_high_risk"), false);
  assert.equal(rechazoEsDelPagador("cc_rejected_other_reason"), false);
  assert.equal(rechazoEsDelPagador("cc_rejected_call_for_authorize"), false);
});

test("un rechazo sin motivo suena: no saber no es 'fue el paciente'", () => {
  assert.equal(rechazoEsDelPagador(null), false);
  assert.equal(rechazoEsDelPagador(undefined), false);
  assert.equal(rechazoEsDelPagador(""), false);
});
