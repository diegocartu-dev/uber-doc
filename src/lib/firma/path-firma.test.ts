// VALIDACIÓN DEL PATH DE FIRMA — runner: node:test + node:assert con tsx.
// Ejecutar:  npm run test:unit
//
// Este validador es lo único entre un profesional cualquiera y la lectura de
// cualquier bucket privado con service role. Si se afloja, se abre el agujero.

import { test } from "node:test";
import assert from "node:assert/strict";
import { esPathFirmaValido, esPathFirmaPropia } from "@/lib/firma/path-firma";

const UID = "11111111-2222-3333-4444-555555555555";
const OTRO = "99999999-8888-7777-6666-555555555555";

test("la firma propia legítima pasa", () => {
  assert.equal(esPathFirmaValido(`medicos/${UID}/firma.png`), true);
  assert.equal(esPathFirmaValido(`medicos/${UID}/firma.jpg`), true);
  assert.equal(esPathFirmaValido(`medicos/${UID}/firma.jpeg`), true);
  assert.equal(esPathFirmaPropia(`medicos/${UID}/firma.png`, UID), true);
});

test("el traversal a otro bucket NO pasa", () => {
  for (const malo of [
    "../capacitacion-profesionales/v1-configurar-2026-09-14.mp4",
    `medicos/${UID}/../../consultas-temp/estudio.pdf`,
    "../credenciales-medicos/otro/credencial.jpg",
    "../firmas-medicos/otro-uid/firma.png",
  ]) {
    assert.equal(esPathFirmaValido(malo), false, malo);
    assert.equal(esPathFirmaPropia(malo, UID), false, malo);
  }
});

test("no vale la firma de OTRO profesional, aunque tenga forma correcta", () => {
  const ajena = `medicos/${OTRO}/firma.png`;
  assert.equal(esPathFirmaValido(ajena), true); // forma correcta
  assert.equal(esPathFirmaPropia(ajena, UID), false); // pero no es la suya
});

test("basura, vacío y nulos no pasan", () => {
  for (const malo of [null, undefined, "", "medicos/x/firma.png", `medicos/${UID}/firma.gif`, `medicos/${UID}/otra.png`, `MEDICOS/${UID}/firma.png`]) {
    assert.equal(esPathFirmaValido(malo as string), false, String(malo));
  }
});
