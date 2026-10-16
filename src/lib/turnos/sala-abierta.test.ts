// La sala de espera de un turno abre 15 minutos antes, en hora argentina.
// Ejecutar:  npx tsx --test src/lib/turnos/sala-abierta.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { antesDeLaSala } from "./sala-abierta";

const ar = (s: string) => Date.parse(`${s}-03:00`);

test("la noche anterior, la sala todavía no abrió", () => {
  assert.equal(antesDeLaSala("2026-10-16", "12:40:00", ar("2026-10-15T22:37:00")), true);
});

test("abre 15 minutos antes, y sigue abierta durante y después del turno", () => {
  assert.equal(antesDeLaSala("2026-10-16", "12:40:00", ar("2026-10-16T12:24:00")), true);
  assert.equal(antesDeLaSala("2026-10-16", "12:40:00", ar("2026-10-16T12:25:00")), false);
  assert.equal(antesDeLaSala("2026-10-16", "12:40:00", ar("2026-10-16T12:40:00")), false);
  assert.equal(antesDeLaSala("2026-10-16", "12:40:00", ar("2026-10-16T13:30:00")), false);
});

test("la hora es argentina aunque el servidor esté en UTC", () => {
  // 15:30 UTC = 12:30 AR: faltan 10 minutos, abierta.
  assert.equal(antesDeLaSala("2026-10-16", "12:40", Date.parse("2026-10-16T15:30:00Z")), false);
  // 15:00 UTC = 12:00 AR: faltan 40 minutos, cerrada.
  assert.equal(antesDeLaSala("2026-10-16", "12:40", Date.parse("2026-10-16T15:00:00Z")), true);
});

test("sin fecha u hora válidas no se frena a nadie", () => {
  assert.equal(antesDeLaSala("", "12:40", ar("2026-10-15T22:00:00")), false);
  assert.equal(antesDeLaSala("2026-10-16", "", ar("2026-10-15T22:00:00")), false);
});
