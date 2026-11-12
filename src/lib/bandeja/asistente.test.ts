// Los límites del asistente de la Bandeja con el envío prendido.
// Ejecutar:  npx tsx --test src/lib/bandeja/asistente.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirEnvio, puedeMarcarSpam, esCasillaAutomatica, MAX_ENVIOS_ASISTENTE_DIA, MAX_ENVIOS_ASISTENTE_POR_DESTINO, MAX_SPAM_ASISTENTE_DIA } from "./asistente";

const ok = { pidioEnviar: true, envioHabilitado: true, direccionProbada: true, remitenteAutentico: true, destinoAutomatico: false, yaAtendido: false, yaRespondido: false, enviadosAlDestinoHoy: 0, enviadosHoy: 0 };

test("con todo en regla, envía", () => {
  assert.deepEqual(decidirEnvio(ok), { enviar: true });
});

test("cada candado deja la respuesta en borrador, con su motivo", () => {
  assert.deepEqual(decidirEnvio({ ...ok, pidioEnviar: false }), { enviar: false, motivo: "no_pidio_enviar" });
  assert.deepEqual(decidirEnvio({ ...ok, envioHabilitado: false }), { enviar: false, motivo: "envio_apagado" });
  assert.deepEqual(decidirEnvio({ ...ok, direccionProbada: false }), { enviar: false, motivo: "direccion_no_probada" });
  assert.deepEqual(decidirEnvio({ ...ok, remitenteAutentico: false }), { enviar: false, motivo: "remitente_no_autenticado" });
  assert.deepEqual(decidirEnvio({ ...ok, destinoAutomatico: true }), { enviar: false, motivo: "destino_automatico" });
  assert.deepEqual(decidirEnvio({ ...ok, yaAtendido: true }), { enviar: false, motivo: "ya_atendido" });
  assert.deepEqual(decidirEnvio({ ...ok, yaRespondido: true }), { enviar: false, motivo: "ya_respondido" });
  assert.deepEqual(decidirEnvio({ ...ok, enviadosAlDestinoHoy: MAX_ENVIOS_ASISTENTE_POR_DESTINO }), { enviar: false, motivo: "tope_destinatario" });
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
  const ajeno = { esEntrada: true, conSesion: false, tieneCuenta: false, leEscribimosAntes: false, marcadosHoy: 0 };
  assert.deepEqual(puedeMarcarSpam(ajeno), { ok: true });
  assert.equal(puedeMarcarSpam({ ...ajeno, esEntrada: false }).ok, false);
  assert.equal(puedeMarcarSpam({ ...ajeno, conSesion: true }).ok, false);
  assert.equal(puedeMarcarSpam({ ...ajeno, tieneCuenta: true }).ok, false);
  assert.equal(puedeMarcarSpam({ ...ajeno, leEscribimosAntes: true }).ok, false);
  assert.equal(puedeMarcarSpam({ ...ajeno, marcadosHoy: MAX_SPAM_ASISTENTE_DIA }).ok, false);
});

test("a una casilla automática no se le contesta solo", () => {
  for (const d of ["no-reply@x.com", "noreply@x.com", "MAILER-DAEMON@x.com", "postmaster@x.com", "bounce+abc@x.com", "notifications@x.com", "donotreply@x.com"]) {
    assert.equal(esCasillaAutomatica(d), true, d);
  }
  for (const d of ["ana@x.com", "replyana@x.com", "soporte@x.com"]) assert.equal(esCasillaAutomatica(d), false, d);
});
