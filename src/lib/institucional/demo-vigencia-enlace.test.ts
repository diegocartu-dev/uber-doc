// Tests de la VIGENCIA DEL ENLACE DE DEMOSTRACIÓN — el reloj cuelga del día de
// la reunión, no del momento en que se emitió el token.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// ── QUÉ PROBLEMA FIJA ESTO ───────────────────────────────────────────────────
// El enlace de la demo vivía 12 horas DESDE SU EMISIÓN. Suena acotado y es lo
// contrario de lo que hacía: no limitaba la exposición (el QR se proyecta el día
// de la reunión y se fotografía ahí), limitaba la PREPARACIÓN. Se carga a los
// participantes con anticipación, se ensaya el circuito, y para cuando llega la
// reunión el QR está muerto. Con la reunión en otra fecha —el caso normal de una
// gira— el enlace nacía condenado.
//
// Anclado al día de la reunión: vive todo lo que haga falta ANTES, y muere igual
// de rápido DESPUÉS. Lo que se prueba acá es que ese anclaje no se rompa, y que
// la pieza frágil —leer un DATE pelado sin desplazarlo de día— siga bien.

import { test } from "node:test";
import assert from "node:assert/strict";
import { inicioDelDiaDeLaReunion } from "@/lib/institucional/demo-invitacion";
import { vencimientoDemo } from "@/lib/institucional/accesos";

// ── El corazón: un DATE pelado no puede cambiar de día ───────────────────────
//
// `demo_sesiones.fecha` es "2026-08-25", sin zona. `new Date("2026-08-25")` lo
// interpreta como UTC, y en Argentina (UTC-3) eso es el 24 a las 21:00 — el
// enlace moriría medio día antes de lo que muestra la pantalla, y nadie lo
// entendería mirando la fecha de la reunión. Tiene que dar el 25 a las 00:00
// LOCAL, sea cual sea la zona de la máquina.

test("la fecha de la reunión se lee en hora local, sin correrse de día", () => {
  const ms = inicioDelDiaDeLaReunion("2026-08-25");
  assert.ok(ms !== undefined, "una fecha válida tiene que resolver");
  const d = new Date(ms!);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7, "agosto es el mes 7 con base cero");
  assert.equal(d.getDate(), 25, "tiene que ser el 25, no el 24: ese es el bug de zona");
  assert.equal(d.getHours(), 0, "arranca a las 00:00 del día de la reunión");
  assert.equal(d.getMinutes(), 0);
});

test("el anclaje sirve para cualquier día del año, incluido fin de mes", () => {
  for (const [fecha, dia, mes] of [
    ["2026-01-01", 1, 0],
    ["2026-02-28", 28, 1],
    ["2026-12-31", 31, 11],
  ] as const) {
    const d = new Date(inicioDelDiaDeLaReunion(fecha)!);
    assert.equal(d.getDate(), dia, `${fecha} tiene que caer el día ${dia}`);
    assert.equal(d.getMonth(), mes, `${fecha} tiene que caer en el mes ${mes}`);
  }
});

// ── Las entradas que no sirven no pueden inventar un ancla ───────────────────
//
// Importa que devuelvan `undefined` y no un número raro: `undefined` hace que
// `crearAccesoLink` caiga al reloj viejo (12 h desde la emisión). Un NaN o un 0
// darían una expiración en 1970 o "Invalid Date", que es peor que el bug viejo.

test("una fecha ausente o ilegible no ancla nada — cae al reloj de emisión", () => {
  for (const malo of [null, undefined, "", "   ", "25/08/2026", "2026-8-5", "ayer", "2026-08"]) {
    assert.equal(
      inicioDelDiaDeLaReunion(malo as string | null | undefined),
      undefined,
      `"${malo}" no debería producir un ancla`
    );
  }
});

test("una fecha con espacios alrededor igual se entiende", () => {
  const limpia = inicioDelDiaDeLaReunion("2026-08-25");
  const sucia = inicioDelDiaDeLaReunion("  2026-08-25  ");
  assert.equal(sucia, limpia, "el trim no puede cambiar el resultado");
});

// ── La consecuencia que motivó todo ──────────────────────────────────────────
//
// Se ejercita `vencimientoDemo`, que es LA función que usa `crearAccesoLink`,
// no una copia del cálculo: por eso está extraída como función pura. Si alguien
// cambia la regla, estos tests se caen — que es el punto.

const vencimiento = (fecha: string) => new Date(vencimientoDemo(inicioDelDiaDeLaReunion(fecha)));

test("un enlace emitido con una semana de anticipación llega vivo a la reunión", () => {
  // El caso real que rompía: se prepara la demo hoy, la reunión es el 25.
  const reunion = new Date(2026, 7, 25, 10, 0, 0); // 25/08 a las 10 de la mañana
  const emitido = new Date(2026, 7, 18, 22, 0, 0); // se preparó el 18 a la noche

  const vence = vencimiento("2026-08-25");

  assert.ok(
    vence.getTime() > reunion.getTime(),
    "con el reloj viejo (12 h desde el 18) esto moría el 19: el QR llegaba muerto a la reunión"
  );
  assert.ok(
    vence.getTime() > emitido.getTime(),
    "el enlace tiene que estar vivo desde que se emite"
  );
});

test("después de la reunión el enlace muere rápido: no sobrevive dos días", () => {
  const vence = vencimiento("2026-08-25");
  const dosDiasDespues = new Date(2026, 7, 27, 0, 0, 0).getTime();

  assert.ok(
    vence.getTime() < dosDiasDespues,
    "el QR se proyecta y se fotografía: pasada la reunión la exposición se corta"
  );
  assert.ok(
    vence.getTime() > new Date(2026, 7, 25, 23, 59, 0).getTime(),
    "pero tiene que cubrir la reunión entera, incluida una que termine tarde"
  );
});

test("sin fecha de reunión, el enlace vuelve al reloj de emisión — nunca es eterno", () => {
  const ahora = new Date(2026, 7, 18, 22, 0, 0).getTime();
  const vence = new Date(vencimientoDemo(undefined, ahora));

  assert.equal(
    vence.getTime(),
    ahora + 12 * 3600_000,
    "sin ancla son 12 h desde la emisión, el comportamiento viejo"
  );
});

test("una fecha basura no produce un vencimiento absurdo", () => {
  const ahora = new Date(2026, 7, 18, 22, 0, 0).getTime();
  for (const basura of [NaN, Infinity, -Infinity]) {
    const vence = new Date(vencimientoDemo(basura, ahora));
    assert.ok(
      Number.isFinite(vence.getTime()),
      `${basura} no puede producir una fecha inválida`
    );
    assert.equal(
      vence.getTime(),
      ahora + 12 * 3600_000,
      `${basura} tiene que caer al reloj de emisión, no a 1970 ni al infinito`
    );
  }
});
