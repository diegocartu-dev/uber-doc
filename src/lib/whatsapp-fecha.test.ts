// La fecha de los avisos de turno al profesional: "hoy", "mañana" o "día d/m", en hora argentina.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaTurnoParaAviso } from "./whatsapp";

test("hoy / mañana / día corto, siempre en hora argentina", () => {
  // 23:30 UTC del 5/10 = 20:30 AR del 5/10: "hoy" sigue siendo el 5.
  const ahora = new Date("2026-10-05T23:30:00Z");
  assert.equal(fechaTurnoParaAviso("2026-10-05", ahora), "hoy");
  assert.equal(fechaTurnoParaAviso("2026-10-06", ahora), "mañana");
  assert.equal(fechaTurnoParaAviso("2026-10-10", ahora), "sáb 10/10");
  // 01:30 UTC del 6/10 = 22:30 AR del 5/10: "hoy" es el 5, no el 6.
  const tarde = new Date("2026-10-06T01:30:00Z");
  assert.equal(fechaTurnoParaAviso("2026-10-05", tarde), "hoy");
  assert.equal(fechaTurnoParaAviso("2026-10-06", tarde), "mañana");
});
