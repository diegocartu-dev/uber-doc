// Tests de la regla que decide si al paciente aceptado se le manda el WhatsApp.
// Ejecutar:  npx tsx --test src/lib/consultas/aceptada-sin-pago.test.ts
//
// Lo que se fija acá es la decisión de Diego del 10/09/2026: el aviso NO sale si
// el paciente está mirando la pantalla, y NUNCA sale si está pagando. El caso que
// manda es el del 22/08, que tardó 137 segundos desde la aceptación hasta que el
// pago se acreditó: con un reloj de 90 s y sin el veto del toque, ese paciente
// habría recibido el WhatsApp adentro del checkout de Mercado Pago.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidirAviso,
  decidirCierre,
  vencioPlazo,
  ESPERA_AVISO_SEG,
  LATIDO_FRESCO_SEG,
  PLAZO_PAGO_MIN,
} from "./aceptada-sin-pago";

const base = {
  segundosDesdeAceptacion: 120,
  estaPagando: false,
  segundosDesdeLatido: null as number | null,
  yaAvisado: false,
};

test("se fue de la pantalla y pasó el plazo del aviso: se manda", () => {
  assert.equal(decidirAviso(base), "mandar");
});

test("antes de los 90 segundos no se manda nada", () => {
  assert.equal(decidirAviso({ ...base, segundosDesdeAceptacion: ESPERA_AVISO_SEG - 1 }), "temprano");
});

test("está mirando la pantalla ahora: el aviso sería ruido", () => {
  assert.equal(decidirAviso({ ...base, segundosDesdeLatido: 5 }), "esta_mirando");
});

test("miró hace rato pero ya no: se manda", () => {
  assert.equal(
    decidirAviso({ ...base, segundosDesdeLatido: LATIDO_FRESCO_SEG + 1 }),
    "mandar"
  );
});

test("EL CASO DEL 22/08: tocó pagar y tarda en el checkout — no se lo interrumpe", () => {
  // 137 segundos desde la aceptación, sin latido (está en el sitio de Mercado
  // Pago, no en nuestra pantalla, así que no hay latido que valga).
  assert.equal(
    decidirAviso({ ...base, segundosDesdeAceptacion: 137, estaPagando: true }),
    "esta_pagando"
  );
});

test("el veto del pago gana incluso pasado el plazo entero", () => {
  assert.equal(
    decidirAviso({ ...base, segundosDesdeAceptacion: 9 * 60, estaPagando: true }),
    "esta_pagando"
  );
});

test("un aviso por consulta: no se repite", () => {
  assert.equal(decidirAviso({ ...base, yaAvisado: true }), "ya_avisado");
});

test("sin latido nunca registrado no se lo da por presente", () => {
  assert.equal(decidirAviso({ ...base, segundosDesdeLatido: null }), "mandar");
});

test("el plazo de pago son 10 minutos", () => {
  assert.equal(PLAZO_PAGO_MIN, 10);
  assert.equal(vencioPlazo(PLAZO_PAGO_MIN * 60 - 1), false);
  assert.equal(vencioPlazo(PLAZO_PAGO_MIN * 60), true);
});

test("el aviso llega antes que el plazo, o no sirve de nada", () => {
  assert.ok(ESPERA_AVISO_SEG < PLAZO_PAGO_MIN * 60);
});

// ── El cierre por plazo, y el veto que evita cobrarle a una consulta muerta ──
// `crear-v2` no escribe nada en la fila de la consulta: mientras el paciente está
// adentro de Mercado Pago, para la base sigue impaga. Si el cron la cierra ahí, el
// pago se acredita después sobre una consulta cancelada y la fila queda sin
// `pago_id`, que es justo lo que el reembolso automático necesita para encontrarlo.

test("en plazo no se cierra nada", () => {
  assert.equal(decidirCierre({ segundosDesdeAceptacion: 60, estaPagando: false }), "en_plazo");
  assert.equal(decidirCierre({ segundosDesdeAceptacion: 60, estaPagando: true }), "en_plazo");
});

test("venció y no está pagando: se cierra", () => {
  assert.equal(decidirCierre({ segundosDesdeAceptacion: 10 * 60, estaPagando: false }), "cerrar");
});

test("venció PERO está adentro del checkout: no se le cierra encima", () => {
  assert.equal(
    decidirCierre({ segundosDesdeAceptacion: 10 * 60 + 5, estaPagando: true }),
    "esperar_checkout"
  );
});

test("la gracia del checkout tiene techo: no deja la consulta viva para siempre", () => {
  assert.equal(decidirCierre({ segundosDesdeAceptacion: 15 * 60, estaPagando: true }), "cerrar");
});
