import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esCaidaConfirmada,
  esHuecoDeProgramador,
  MINUTOS_ENTRE_ROJOS_SIN_ESTADO,
} from "./criterio-caida";

// Qué es una caída (Diego, 23/08/2026): "que no se puedan cursar consultas
// normalmente". No saber si se puede NO es lo mismo que no poder.

test("una sola corrida caída NO alcanza: puede ser un blip del runner", () => {
  assert.equal(esCaidaConfirmada({ fallosSeguidos: 1, estadoLegible: true }), false);
});

test("dos corridas seguidas SÍ son una caída", () => {
  assert.equal(esCaidaConfirmada({ fallosSeguidos: 2, estadoLegible: true }), true);
  assert.equal(esCaidaConfirmada({ fallosSeguidos: 7, estadoLegible: true }), true);
});

test("si no se puede leer el estado, la base es lo que no responde: es caída", () => {
  // No hay contador posible — la imposibilidad de leerlo ES la señal.
  assert.equal(esCaidaConfirmada({ fallosSeguidos: 1, estadoLegible: false }), true);
});

// ── El corazón del asunto: 35 de 49 alarmas de agosto eran esto ──────────────

test("un hueco de 4 minutos es del programador de Vercel, NO una caída", () => {
  // El caso real y repetido: el cron corre cada minuto, Vercel se saltea unas
  // corridas alrededor del cambio de hora, y el monitor volvía anunciando "una
  // caída de aproximadamente 4 minutos" sin que nada se hubiera caído.
  assert.equal(esHuecoDeProgramador(4 * 60_000), true);
  assert.equal(esHuecoDeProgramador(3 * 60_000), true);
  assert.equal(esHuecoDeProgramador(7 * 60_000), true);
});

test("un hueco largo SÍ es un corte real: la base cayó y no se pudo registrar", () => {
  // Los dos episodios reales de agosto duraron 112 y 317 minutos.
  assert.equal(esHuecoDeProgramador(13 * 60_000), false);
  assert.equal(esHuecoDeProgramador(112 * 60_000), false);
  assert.equal(esHuecoDeProgramador(317 * 60_000), false);
});

test("el umbral del hueco tiene MUCHO margen sobre el intervalo del cron", () => {
  // La causa del ruido era un umbral de 3 min sobre un cron de 1 min: sin
  // margen. Si alguien lo vuelve a bajar, este test lo frena.
  const UN_MINUTO = 60_000;
  let umbral = 1;
  while (esHuecoDeProgramador(umbral * UN_MINUTO) && umbral < 120) umbral++;
  assert.ok(
    umbral >= 10,
    `el umbral del hueco quedó en ${umbral} min: demasiado cerca del intervalo del cron (1 min). Un hueco del programador volvería a leerse como caída.`
  );
});

test("el freno del rojo sin estado sale del reloj, no de la memoria", () => {
  // Con la base caída no hay dónde anotar que ya avisamos, y Vercel recicla la
  // instancia: un contador en memoria arrancaba en cero cada vez y por eso
  // salieron 68 mails en un día. El reloj es lo único que sobrevive.
  assert.ok(MINUTOS_ENTRE_ROJOS_SIN_ESTADO >= 15, "techo de mails por hora demasiado alto");
  const porHora = 60 / MINUTOS_ENTRE_ROJOS_SIN_ESTADO;
  assert.ok(porHora <= 4, `${porHora} mails/hora en una caída larga sigue siendo una tormenta`);
});
