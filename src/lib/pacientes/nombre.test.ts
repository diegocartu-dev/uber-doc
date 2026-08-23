import { test } from "node:test";
import assert from "node:assert/strict";
import {
  componerNombreCompleto,
  normalizarNombreApellido,
  separarNombreCompleto,
  tieneNombreYApellido,
} from "./nombre";

test("componer: junta con un espacio y limpia sobrantes", () => {
  assert.equal(componerNombreCompleto("  Luciana ", " Toronconte  "), "Luciana Toronconte");
  assert.equal(componerNombreCompleto("María  Belén", "Pérez"), "María Belén Pérez");
  assert.equal(componerNombreCompleto("Luciana", ""), "Luciana");
  assert.equal(componerNombreCompleto("", ""), "");
});

test("separar: prefill — primera palabra al nombre, el resto al apellido", () => {
  assert.deepEqual(separarNombreCompleto("Luciana Toronconte"), { nombre: "Luciana", apellido: "Toronconte" });
  assert.deepEqual(separarNombreCompleto("Lisandro Torres Arata"), { nombre: "Lisandro", apellido: "Torres Arata" });
  assert.deepEqual(separarNombreCompleto("Luciana"), { nombre: "Luciana", apellido: "" });
  assert.deepEqual(separarNombreCompleto("   "), { nombre: "", apellido: "" });
  assert.deepEqual(separarNombreCompleto(null), { nombre: "", apellido: "" });
});

test("normalizar: capitaliza cada parte y compone — el caso real, en minúscula", () => {
  const r = normalizarNombreApellido("luciana", "toronconte");
  assert.equal(r.nombre[0], "L");
  assert.equal(r.apellido[0], "T");
  assert.equal(r.nombre_completo, `${r.nombre} ${r.apellido}`);
  assert.match(r.nombre_completo, /^L\w+ T\w+$/);
});

test("tieneNombreYApellido: la regla del gate previo a la consulta", () => {
  // Fila nueva, con los dos campos: completa.
  assert.equal(tieneNombreYApellido({ nombre: "Luciana", apellido: "Toronconte", nombre_completo: "Luciana Toronconte" }), true);
  // El caso que originó todo: una sola palabra, sin apellido → incompleta.
  assert.equal(tieneNombreYApellido({ nombre: null, apellido: null, nombre_completo: "Luciana" }), false);
  assert.equal(tieneNombreYApellido({ nombre: "Luciana", apellido: "", nombre_completo: "Luciana" }), false);
  // Fila anterior a la migración, sin partir, con dos palabras: se acepta.
  assert.equal(tieneNombreYApellido({ nombre: null, apellido: null, nombre_completo: "Lisandro Torres Arata" }), true);
  // Vacía: no.
  assert.equal(tieneNombreYApellido({ nombre: null, apellido: null, nombre_completo: null }), false);
  assert.equal(tieneNombreYApellido({}), false);
  // Espacios no cuentan como apellido.
  assert.equal(tieneNombreYApellido({ nombre: "Luciana", apellido: "   ", nombre_completo: "Luciana" }), false);
});
