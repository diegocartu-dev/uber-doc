// Tests del recordatorio de 10 minutos al paciente.
// Ejecutar:  npx tsx --test src/lib/turnos/recordatorio-paciente.test.ts
//
// El caso que manda: un turno de las 08:30 (hora argentina). El cron viejo, con
// la hora del servidor en UTC, buscaba turnos entre las 11:20 y las 11:30 y no
// encontraba ninguno. Acá se fija que a las 08:20 argentinas el turno de las
// 08:30 cae en la ventana, sin importar la zona del servidor.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  minutosParaElTurno,
  tocaRecordatorio10m,
  preferenciaRecordatorio10m,
  mandarMailDeRespaldo,
  textoMinutos,
} from "./recordatorio-paciente";

// 08:20:03 en Argentina = 11:20:03 UTC.
const A_LAS_0820 = Date.parse("2026-10-12T11:20:03Z");

test("el turno de las 08:30 cae en la ventana a las 08:20 argentinas", () => {
  const min = minutosParaElTurno("2026-10-12", "08:30:00", A_LAS_0820);
  assert.ok(min !== null && Math.abs(min - 9.95) < 0.01);
  assert.equal(tocaRecordatorio10m(min), true);
  assert.equal(textoMinutos(min!), "10 minutos");
});

test("la hora del servidor no cambia nada: es el mismo instante en cualquier zona", () => {
  const conHoraCorta = minutosParaElTurno("2026-10-12", "08:30", A_LAS_0820);
  const conHoraLarga = minutosParaElTurno("2026-10-12", "08:30:00", A_LAS_0820);
  assert.equal(conHoraCorta, conHoraLarga);
});

test("antes de los 10 minutos no sale", () => {
  const a_las_0815 = Date.parse("2026-10-12T11:15:00Z");
  assert.equal(tocaRecordatorio10m(minutosParaElTurno("2026-10-12", "08:30:00", a_las_0815)), false);
});

test("si una corrida se salteó, la siguiente lo manda igual hasta el inicio", () => {
  const a_las_0826 = Date.parse("2026-10-12T11:26:00Z");
  const min = minutosParaElTurno("2026-10-12", "08:30:00", a_las_0826);
  assert.equal(tocaRecordatorio10m(min), true);
  assert.equal(textoMinutos(min!), "4 minutos");
});

test("con el turno empezado ya no sale", () => {
  const a_las_0831 = Date.parse("2026-10-12T11:31:00Z");
  assert.equal(tocaRecordatorio10m(minutosParaElTurno("2026-10-12", "08:30:00", a_las_0831)), false);
});

test("un turno pasada la medianoche se avisa el día anterior", () => {
  // 23:55 del 12/10 argentino = 02:55 UTC del 13/10.
  const a_las_2355 = Date.parse("2026-10-13T02:55:00Z");
  const min = minutosParaElTurno("2026-10-13", "00:05:00", a_las_2355);
  assert.equal(tocaRecordatorio10m(min), true);
});

test("una fecha rota no se manda (ni revienta)", () => {
  assert.equal(minutosParaElTurno("no-es-fecha", "08:30:00", A_LAS_0820), null);
  assert.equal(tocaRecordatorio10m(null), false);
});

test("preferencias: lo que eligió el paciente al reservar", () => {
  assert.deepEqual(preferenciaRecordatorio10m({ cuando: "24h,10m", canal: "ambos" }), { quiere: true, email: true, push: true });
  assert.deepEqual(preferenciaRecordatorio10m({ cuando: "10m", canal: "email" }), { quiere: true, email: true, push: false });
  assert.deepEqual(preferenciaRecordatorio10m({ cuando: "10m", canal: "notificaciones" }), { quiere: true, email: false, push: true });
  assert.equal(preferenciaRecordatorio10m({ cuando: "24h", canal: "ambos" }).quiere, false);
  assert.equal(preferenciaRecordatorio10m({ cuando: "", canal: "ambos" }).quiere, false);
});

test("preferencias: el valor por defecto de la columna y la fila sin dato mandan por los dos", () => {
  assert.deepEqual(preferenciaRecordatorio10m({ cuando: "todos", canal: "ambos" }), { quiere: true, email: true, push: true });
  assert.deepEqual(preferenciaRecordatorio10m(null), { quiere: true, email: true, push: true });
});

test("eligió solo notificaciones y no tiene ninguna activa: va por mail", () => {
  const soloPush = preferenciaRecordatorio10m({ cuando: "10m", canal: "notificaciones" });
  assert.equal(mandarMailDeRespaldo(soloPush, false), true);
  assert.equal(mandarMailDeRespaldo(soloPush, true), false);
  const ambos = preferenciaRecordatorio10m({ cuando: "10m", canal: "ambos" });
  assert.equal(mandarMailDeRespaldo(ambos, false), false); // el mail ya sale igual
});

test("nunca dice 'en 0 minutos'", () => {
  assert.equal(textoMinutos(0.2), "1 minuto");
});
