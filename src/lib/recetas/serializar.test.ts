// El texto de la receta no cambia por mover la función, y la lista estructurada
// solo se guarda si es la misma receta que el texto.
// Ejecutar:  npx tsx --test src/lib/recetas/serializar.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { serializarMedicamentos, listaCoincideConReceta } from "./serializar";

const ibuprofeno = { nombre: "Ibupirac 400", droga: "ibuprofeno", presentacion: "20 comprimidos", forma_farmaceutica: "comprimido", via: "oral" };
const amoxicilina = { nombre: "amoxicilina", droga: "amoxicilina", presentacion: "", forma_farmaceutica: "", via: "" };

test("el formato de siempre, letra por letra (con 1 envase o sin dato no se agrega nada)", () => {
  const esperado =
    "Rp/ IBUPROFENO\n    Nombre comercial: Ibupirac 400\n    Forma farmacéutica: Comprimido\n    Presentación: 20 comprimidos\n    Vía: oral" +
    "\n\n" +
    "Rp/ AMOXICILINA" +
    "\n\n\n\n" +
    "1 comprimido cada 8 horas";
  assert.equal(serializarMedicamentos([ibuprofeno, amoxicilina], "  1 comprimido cada 8 horas "), esperado);
  assert.equal(serializarMedicamentos([{ ...ibuprofeno, cantidad: 1 }, amoxicilina], "  1 comprimido cada 8 horas "), esperado);
});

test("con más de un envase, la receta lo dice", () => {
  assert.equal(serializarMedicamentos([{ ...amoxicilina, cantidad: 2 }], ""), "Rp/ AMOXICILINA\n    Cantidad: 2 envases");
});

test("los ítems sin nombre no entran", () => {
  assert.equal(serializarMedicamentos([{ nombre: "  ", droga: "x" }], ""), "");
});

test("la lista coincide solo con su propia receta", () => {
  const texto = serializarMedicamentos([ibuprofeno, { ...amoxicilina, cantidad: 2 }], "Tomar con comida");
  assert.equal(listaCoincideConReceta([ibuprofeno, { ...amoxicilina, cantidad: 2 }], texto), true);
  // Sin texto libre también.
  assert.equal(listaCoincideConReceta([ibuprofeno], serializarMedicamentos([ibuprofeno], "")), true);
  // Otra cantidad, otro medicamento, o un medicamento de menos: no.
  assert.equal(listaCoincideConReceta([ibuprofeno, amoxicilina], texto), false);
  assert.equal(listaCoincideConReceta([ibuprofeno], texto), false);
  assert.equal(listaCoincideConReceta([amoxicilina, ibuprofeno], texto), false);
  // Una lista vacía nunca coincide.
  assert.equal(listaCoincideConReceta([], texto), false);
});
