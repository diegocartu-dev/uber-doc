// La etiqueta de la pantalla "Demanda" dejó de ser un número: desde que la fila
// nombra al profesional, "eligió, nadie lo aceptó" señala a una PERSONA, y es lo
// que va a disparar un aviso o una sanción.
//
// Estos tests fijan la única regla que importa: solo es imputable el pedido que
// LE LLEGÓ al profesional y no tomó. Todo lo demás —un turno que el paciente no
// reservó, un pedido que nunca mandó, un retiro suyo, un plazo todavía
// corriendo— no es culpa de nadie del otro lado.

import assert from "node:assert/strict";
import { test } from "node:test";
import { decidirResultado, type EntradaResultado } from "../../src/lib/insights/resultado-busqueda";

const base: EntradaResultado = {
  provincia: "CABA",
  medicosProvincia: 42,
  ciOnline: 1,
  hayOfertaEnElPais: true,
  seAtendio: false,
  pago: false,
  eligio: true,
  alguienAcepto: false,
  desenlaces: [],
};
const con = (x: Partial<EntradaResultado>) => decidirResultado({ ...base, ...x });

test("el pedido que le llegó y no tomó SÍ es falla de oferta", () => {
  const r = con({ desenlaces: ["sin_respuesta"] });
  assert.equal(r.resultado, "eligió, nadie lo aceptó");
  assert.equal(r.matchHabia, false, "es deuda nuestra: cuenta como sin match");
});

test("elegir para un TURNO y no reservar no acusa a nadie", () => {
  // Caso real del 28/08: la paciente abrió la agenda de una profesional y se
  // fue. En un turno nadie acepta nada — antes esto decía 'nadie lo aceptó'.
  const r = con({ desenlaces: ["no_reservo"] });
  assert.equal(r.resultado, "eligió turno, no reservó");
  assert.equal(r.matchHabia, true, "la oferta estuvo; no reservó el paciente");
});

test("elegir y no llegar a mandar el pedido no acusa a nadie", () => {
  const r = con({ desenlaces: ["no_pidio"] });
  assert.equal(r.resultado, "eligió, no llegó a pedir");
  assert.equal(r.matchHabia, true);
});

test("el retiro del paciente no es falla del profesional", () => {
  const r = con({ desenlaces: ["retirado"] });
  assert.equal(r.resultado, "eligió, el paciente se retiró");
  assert.equal(r.matchHabia, true);
});

test("un pedido todavía vivo no se juzga: el plazo sigue corriendo", () => {
  const r = con({ desenlaces: ["en_progreso"] });
  assert.equal(r.resultado, "esperando que lo tomen");
  assert.equal(r.matchHabia, true);
});

test("un solo pedido sin tomar tiñe la búsqueda, aunque el resto sea ruido", () => {
  assert.equal(con({ desenlaces: ["no_reservo", "sin_respuesta"] }).resultado, "eligió, nadie lo aceptó");
  assert.equal(con({ desenlaces: ["retirado", "sin_respuesta"] }).resultado, "eligió, nadie lo aceptó");
});

test("sin ningún pedido, ninguna rama se etiqueta sola", () => {
  // `every` sobre una lista vacía devuelve true: sin la guarda, una sesión sin
  // pedidos caía en 'eligió turno, no reservó' por accidente. Es el bug que
  // apareció escribiendo esto.
  const r = con({ desenlaces: [] });
  assert.notEqual(r.resultado, "eligió turno, no reservó");
  assert.notEqual(r.resultado, "eligió, no llegó a pedir");
  assert.notEqual(r.resultado, "eligió, el paciente se retiró");
});

test("si un profesional se hizo cargo, la búsqueda no es falla de oferta", () => {
  assert.equal(con({ alguienAcepto: true, desenlaces: ["abandono"] }).resultado, "eligió médico, no pagó");
  assert.equal(con({ seAtendio: true, desenlaces: ["atendida"] }).resultado, "se atendió");
  assert.equal(con({ pago: true, desenlaces: ["abandono"] }).resultado, "pagó");
});

test("la falta de oferta se detecta antes que cualquier conducta", () => {
  assert.equal(con({ medicosProvincia: 0 }).resultado, "sin médicos para su provincia");
  assert.equal(con({ ciOnline: 0, eligio: false }).resultado, "había médicos pero ninguno en línea");
  assert.equal(con({ eligio: false }).resultado, "había oferta, no eligió");
});

test("sin provincia, el match depende de que haya oferta en el país", () => {
  assert.equal(con({ provincia: null }).matchHabia, true);
  assert.equal(con({ provincia: null, hayOfertaEnElPais: false }).matchHabia, false);
});
