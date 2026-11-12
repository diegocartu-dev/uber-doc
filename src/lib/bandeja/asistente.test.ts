// Los límites del asistente de la Bandeja con el envío prendido.
// Ejecutar:  npx tsx --test src/lib/bandeja/asistente.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirEnvio, puedeMarcarSpam, MAX_ENVIOS_ASISTENTE_DIA } from "./asistente";

const ok = { pidioEnviar: true, envioHabilitado: true, direccionProbada: true, yaRespondido: false, enviadosHoy: 0 };

test("con todo en regla, envía", () => {
  assert.deepEqual(decidirEnvio(ok), { enviar: true });
});

test("cada candado deja la respuesta en borrador, con su motivo", () => {
  assert.deepEqual(decidirEnvio({ ...ok, pidioEnviar: false }), { enviar: false, motivo: "no_pidio_enviar" });
  assert.deepEqual(decidirEnvio({ ...ok, envioHabilitado: false }), { enviar: false, motivo: "envio_apagado" });
  assert.deepEqual(decidirEnvio({ ...ok, direccionProbada: false }), { enviar: false, motivo: "direccion_no_probada" });
  assert.deepEqual(decidirEnvio({ ...ok, yaRespondido: true }), { enviar: false, motivo: "ya_respondido" });
  assert.deepEqual(decidirEnvio({ ...ok, enviadosHoy: MAX_ENVIOS_ASISTENTE_DIA }), { enviar: false, motivo: "tope_diario" });
  assert.deepEqual(decidirEnvio({ ...ok, enviadosHoy: MAX_ENVIOS_ASISTENTE_DIA - 1 }), { enviar: true });
});

test("el interruptor manda sobre todo lo demás", () => {
  assert.deepEqual(decidirEnvio({ ...ok, envioHabilitado: false, direccionProbada: false, yaRespondido: true }), {
    enviar: false,
    motivo: "envio_apagado",
  });
});

test("spam: solo lo que no es de nadie nuestro", () => {
  const ajeno = { esEntrada: true, conSesion: false, tieneCuenta: false, leEscribimosAntes: false };
  assert.deepEqual(puedeMarcarSpam(ajeno), { ok: true });
  assert.equal(puedeMarcarSpam({ ...ajeno, esEntrada: false }).ok, false);
  assert.equal(puedeMarcarSpam({ ...ajeno, conSesion: true }).ok, false);
  assert.equal(puedeMarcarSpam({ ...ajeno, tieneCuenta: true }).ok, false);
  assert.equal(puedeMarcarSpam({ ...ajeno, leEscribimosAntes: true }).ok, false);
});
