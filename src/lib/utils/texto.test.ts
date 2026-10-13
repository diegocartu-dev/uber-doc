import { test } from "node:test";
import assert from "node:assert/strict";
import { articuloMedico, formatNombreMedico } from "./texto";

test("el título que eligió el profesional se antepone al nombre", () => {
  assert.equal(formatNombreMedico("ana garcía", "Dra."), "Dra. Ana García");
  assert.equal(formatNombreMedico("carlos lópez", "Dr."), "Dr. Carlos López");
  assert.equal(formatNombreMedico("ana garcía", "Lic."), "Lic. Ana García");
});

test("sin título no se inventa ninguno", () => {
  assert.equal(formatNombreMedico("Ana García"), "Ana García");
  assert.equal(formatNombreMedico("Ana García", null), "Ana García");
  assert.equal(formatNombreMedico("", "Dr."), "");
});

test("un nombre que ya trae Dr./Dra. no se duplica", () => {
  assert.equal(formatNombreMedico("Dra. Ana García", "Dra."), "Dra. Ana García");
  assert.equal(formatNombreMedico("Dr Pedro Ruiz", "Dr."), "Dr Pedro Ruiz");
  assert.equal(formatNombreMedico("Dr.Pedro Ruiz", "Dr."), "Dr. Pedro Ruiz");
});

test("Lic. (psicología): un nombre cargado con el título no sale 'Lic. Lic.'", () => {
  assert.equal(formatNombreMedico("Lic. Ana García", "Lic."), "Lic. Ana García");
  assert.equal(formatNombreMedico("lic. ana garcía", "Lic."), "Lic. Ana García");
  assert.equal(formatNombreMedico("Lic Ana García", "Lic."), "Lic Ana García");
  assert.equal(formatNombreMedico("Lic.Ana García", "Lic."), "Lic. Ana García");
});

test("un nombre que EMPIEZA con las letras del título no es un título", () => {
  // Después del prefijo se exige un espacio: "Drago" y "Licia" son nombres.
  assert.equal(formatNombreMedico("Drago Pérez", "Dr."), "Dr. Drago Pérez");
  assert.equal(formatNombreMedico("Licia Ruiz", "Lic."), "Lic. Licia Ruiz");
});

test("el artículo sale solo de Dr./Dra.; Lic. es neutro y no se adivina el género", () => {
  assert.equal(articuloMedico("Dra."), "la");
  assert.equal(articuloMedico("Dr."), "el");
  assert.equal(articuloMedico("Lic."), "");
  assert.equal(articuloMedico(null), "");
  assert.equal(articuloMedico(undefined), "");
});
