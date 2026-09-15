// QUIÉN VE LOS VIDEOS DE CAPACITACIÓN — runner: node:test + node:assert con tsx.
// Ejecutar:  npm run test:unit  (o npx tsx --test src/lib/capacitacion.test.ts)
//
// El gate es la única cosa entre un video privado y alguien que no debería
// verlo, y se evalúa en DOS lugares: la pantalla y la ruta que firma el link.
// Si alguna vez se relaja acá, se relaja en los dos.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  puedeVerCapacitacion,
  videoPorId,
  videosParaPantalla,
  VIDEOS_CAPACITACION,
  SEGUNDOS_LINK_FIRMADO,
} from "@/lib/capacitacion";

test("aprobado de verdad: ve los videos", () => {
  assert.equal(puedeVerCapacitacion({ verificado: true, estado_registro: "aprobado", dado_de_baja: false }), true);
});

test("dado de baja NO los ve, aunque siga figurando aprobado", () => {
  // Es el caso que motiva mirar la baja: no toca verificado ni estado_registro.
  assert.equal(puedeVerCapacitacion({ verificado: true, estado_registro: "aprobado", dado_de_baja: true }), false);
});

test("pendiente, rechazado o suspendido NO los ven", () => {
  for (const estado of ["pendiente_revision", "rechazado", "suspendido"]) {
    assert.equal(puedeVerCapacitacion({ verificado: false, estado_registro: estado, dado_de_baja: false }), false, estado);
  }
});

test("una sola de las dos marcas de aprobación no alcanza", () => {
  assert.equal(puedeVerCapacitacion({ verificado: true, estado_registro: "pendiente_revision", dado_de_baja: false }), false);
  assert.equal(puedeVerCapacitacion({ verificado: false, estado_registro: "aprobado", dado_de_baja: false }), false);
});

test("sin fila, o con datos que no vinieron: cerrado", () => {
  // Fail-closed: si la lectura falló, no hay prueba de que esté aprobado.
  assert.equal(puedeVerCapacitacion(null), false);
  assert.equal(puedeVerCapacitacion(undefined), false);
  assert.equal(puedeVerCapacitacion({}), false);
  assert.equal(puedeVerCapacitacion({ verificado: null, estado_registro: null, dado_de_baja: null }), false);
});

test("dado_de_baja ausente cuenta como no dado de baja", () => {
  assert.equal(puedeVerCapacitacion({ verificado: true, estado_registro: "aprobado" }), true);
});

test("la ruta solo firma los videos del catálogo", () => {
  assert.equal(videoPorId("empezar")?.archivo.endsWith(".mp4"), true);
  assert.equal(videoPorId("consulta")?.archivo.endsWith(".mp4"), true);
  assert.equal(videoPorId("../credenciales-medicos/algo"), null);
  assert.equal(videoPorId(""), null);
});

test("ids aptos para URL y archivos sin barras", () => {
  for (const v of VIDEOS_CAPACITACION) {
    assert.match(v.id, /^[a-z-]+$/, v.id);
    assert.equal(v.archivo.includes("/"), false, v.archivo);
  }
});

test("la pantalla no recibe los nombres de los objetos del bucket", () => {
  for (const v of videosParaPantalla()) {
    assert.equal("archivo" in v, false, v.id);
  }
  assert.equal(videosParaPantalla().length, VIDEOS_CAPACITACION.length);
});

test("el link firmado no es corto: con minutos se corta el video a la mitad", () => {
  assert.ok(SEGUNDOS_LINK_FIRMADO >= 60 * 60);
});
