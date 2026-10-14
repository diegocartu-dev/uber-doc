// La receta estructurada se valida antes de guardarse.
// Ejecutar:  npx tsx --test src/lib/recetas/medicamentos.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cantidadDeEnvases, normalizarMedicamentos, MAX_MEDICAMENTOS } from "./medicamentos";

test("la cantidad de envases es un entero de 1 a 99; si no, 1", () => {
  assert.equal(cantidadDeEnvases(undefined), 1);
  assert.equal(cantidadDeEnvases(0), 1);
  assert.equal(cantidadDeEnvases(-3), 1);
  assert.equal(cantidadDeEnvases(2.5), 1);
  assert.equal(cantidadDeEnvases("3"), 3);
  assert.equal(cantidadDeEnvases(2), 2);
  assert.equal(cantidadDeEnvases(500), 99);
});

test("se guarda solo lo conocido, recortado, y sin los ítems sin nombre", () => {
  const r = normalizarMedicamentos([
    { id: "x", nombre: "  Ibuprofeno 400  ", droga: "IBUPROFENO", presentacion: "20 comprimidos", forma_farmaceutica: "comprimido", via: "oral", cantidad: 2, extra: "no" },
    { nombre: "   ", droga: "NADA" },
  ]);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.medicamentos, [
      { nombre: "Ibuprofeno 400", droga: "IBUPROFENO", presentacion: "20 comprimidos", forma_farmaceutica: "comprimido", via: "oral", cantidad: 2 },
    ]);
  }
});

test("lo que no es una lista razonable no se guarda", () => {
  assert.equal(normalizarMedicamentos(null).ok, false);
  assert.equal(normalizarMedicamentos("Ibuprofeno").ok, false);
  assert.equal(normalizarMedicamentos([]).ok, false);
  assert.equal(normalizarMedicamentos([{ droga: "sin nombre" }]).ok, false);
  assert.equal(normalizarMedicamentos([42]).ok, false);
  assert.equal(normalizarMedicamentos(Array.from({ length: MAX_MEDICAMENTOS + 1 }, () => ({ nombre: "a" }))).ok, false);
});

test("un texto larguísimo se recorta", () => {
  const r = normalizarMedicamentos([{ nombre: "a".repeat(1000) }]);
  assert.equal(r.ok && r.medicamentos[0].nombre.length, 200);
});
