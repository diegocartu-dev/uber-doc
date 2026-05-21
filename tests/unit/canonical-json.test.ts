import { canonicalJSON } from "../../src/lib/firma/receta";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

// Test 1: Orden de keys — el core del fix 3.3
const obj1 = { medicamento: "ibuprofeno", dosis: "10mg", via: "oral" };
const obj2 = { via: "oral", dosis: "10mg", medicamento: "ibuprofeno" };
const obj3 = { dosis: "10mg", medicamento: "ibuprofeno", via: "oral" };
assert(
  canonicalJSON(obj1) === canonicalJSON(obj2),
  "mismo objeto con keys en distinto orden produce misma serialización"
);
assert(
  canonicalJSON(obj2) === canonicalJSON(obj3),
  "tres órdenes distintos producen misma serialización"
);

// Test 2: El resultado tiene keys ordenadas alfabéticamente
const result = canonicalJSON({ z: 1, a: 2, m: 3 });
assert(
  result === '{"a":2,"m":3,"z":1}',
  `keys ordenadas alfabéticamente: got ${result}`
);

// Test 3: Objetos anidados — keys ordenadas en todos los niveles
const nested1 = { paciente: { nombre: "Juan", dni: "12345678" }, medicamento: { dosis: "10mg", nombre: "ibuprofeno" } };
const nested2 = { medicamento: { nombre: "ibuprofeno", dosis: "10mg" }, paciente: { dni: "12345678", nombre: "Juan" } };
assert(
  canonicalJSON(nested1) === canonicalJSON(nested2),
  "objetos anidados con keys en distinto orden producen misma serialización"
);

// Test 4: Arrays mantienen orden (los arrays son ordenados por posición, no por contenido)
const arr1 = { items: [{ b: 2, a: 1 }, { d: 4, c: 3 }] };
const arr2 = { items: [{ a: 1, b: 2 }, { c: 3, d: 4 }] };
assert(
  canonicalJSON(arr1) === canonicalJSON(arr2),
  "arrays con objetos cuyos keys están en distinto orden producen misma serialización"
);

// Test 5: Valores primitivos
assert(canonicalJSON(null) === "null", "null");
assert(canonicalJSON(true) === "true", "boolean true");
assert(canonicalJSON(false) === "false", "boolean false");
assert(canonicalJSON(42) === "42", "number");
assert(canonicalJSON("hello") === '"hello"', "string");

// Test 6: Array vacío y objeto vacío
assert(canonicalJSON([]) === "[]", "array vacío");
assert(canonicalJSON({}) === "{}", "objeto vacío");

// Test 7: Datos reales de prescripción — simula lo que vendría de JSONB
const prescripcion1 = {
  diagnostico: "dolor lumbar",
  medicamentos: [
    { nombre: "ibuprofeno", dosis: "400mg", cantidad: 20, via: "oral", posologia: "cada 8 horas" },
    { nombre: "diclofenac", dosis: "75mg", cantidad: 10, via: "intramuscular", posologia: "cada 12 horas" },
  ],
  indicaciones: "Reposo relativo por 72 horas",
};
const prescripcion2 = {
  medicamentos: [
    { posologia: "cada 8 horas", via: "oral", cantidad: 20, nombre: "ibuprofeno", dosis: "400mg" },
    { via: "intramuscular", posologia: "cada 12 horas", dosis: "75mg", cantidad: 10, nombre: "diclofenac" },
  ],
  indicaciones: "Reposo relativo por 72 horas",
  diagnostico: "dolor lumbar",
};
assert(
  canonicalJSON(prescripcion1) === canonicalJSON(prescripcion2),
  "prescripciones con keys reordenadas (simula JSONB reordering) producen misma serialización"
);

// Test 8: undefined se trata como null
assert(canonicalJSON(undefined) === "null", "undefined → null");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
