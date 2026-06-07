// Tests de componerEvolucion — runner: node:test + node:assert, corridos con tsx.
// Ejecutar:  npx tsx --test src/lib/evolucion/componer.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { componerEvolucion, type DatosEvolucion } from "./componer";

// Helper: base con todo en null; cada test setea solo lo que necesita.
function datos(parcial: Partial<DatosEvolucion>): DatosEvolucion {
  return {
    edad: null,
    sexo: null,
    motivo: null,
    sintomas: null,
    plazo: null,
    diagnostico: null,
    indicaciones: null,
    receta: null,
    comentario: null,
    ...parcial,
  };
}

// ---------------------------------------------------------------------------
// Caso completo — Consulta Inmediata con triage completo
// ---------------------------------------------------------------------------
test("CI completa: demográfico + motivo + síntomas + plazo + dx + indicaciones + receta", () => {
  const out = componerEvolucion(
    datos({
      edad: 47,
      sexo: "masculino",
      motivo: "dolor de garganta y fiebre desde ayer",
      sintomas: ["Fiebre", "Dolor de garganta", "Tos"],
      plazo: "1-3 días",
      diagnostico: "faringitis aguda",
      indicaciones: "reposo, hidratación y paracetamol cada 8 horas",
      receta: "Rp/ AMOXICILINA 500 mg, 1 comprimido cada 8 horas por 7 días",
    })
  );
  assert.equal(
    out,
    "Paciente de 47 años, masculino. Consulta por dolor de garganta y fiebre desde ayer. " +
      "Refiere fiebre, dolor de garganta y tos de 1 a 3 días de evolución. " +
      "Diagnóstico: faringitis aguda. Se indica reposo, hidratación y paracetamol cada 8 horas. " +
      "Se prescribe Rp/ AMOXICILINA 500 mg, 1 comprimido cada 8 horas por 7 días."
  );
});

// ---------------------------------------------------------------------------
// Turno sin triage — arranca por Diagnóstico sin quedar raro
// ---------------------------------------------------------------------------
test("turno sin triage: arranca por Diagnóstico, sin motivo/síntomas/plazo", () => {
  const out = componerEvolucion(
    datos({
      edad: 62,
      sexo: "femenino",
      diagnostico: "hipertensión arterial controlada",
      indicaciones: "continuar con enalapril 10 mg/día y control en 30 días",
    })
  );
  assert.equal(
    out,
    "Paciente de 62 años, femenino. Diagnóstico: hipertensión arterial controlada. " +
      "Se indica continuar con enalapril 10 mg/día y control en 30 días."
  );
});

test("turno mínimo: solo demográfico + diagnóstico", () => {
  const out = componerEvolucion(datos({ edad: 30, sexo: "masculino", diagnostico: "lumbalgia" }));
  assert.equal(out, "Paciente de 30 años, masculino. Diagnóstico: lumbalgia.");
});

// ---------------------------------------------------------------------------
// Campos vacíos — la evolución NO inventa cierre
// ---------------------------------------------------------------------------
test("sin indicaciones ni receta: no inventa cierre ni frases neutras", () => {
  const out = componerEvolucion(
    datos({
      edad: 40,
      sexo: "femenino",
      motivo: "control de rutina",
      diagnostico: "paciente sana",
    })
  );
  assert.equal(
    out,
    "Paciente de 40 años, femenino. Consulta por control de rutina. Diagnóstico: paciente sana."
  );
  // Garantía dura: nada de pautas de alarma, alergias, signos vitales, cierre neutro.
  assert.doesNotMatch(out, /alarma|alergia|niega|signos vitales|examen físico/i);
});

test("todo null: devuelve solo 'Paciente.' (sin frases colgadas)", () => {
  const out = componerEvolucion(datos({}));
  assert.equal(out, "Paciente.");
});

test("indicaciones vacías no dejan 'Se indica .' colgando", () => {
  const out = componerEvolucion(datos({ diagnostico: "cefalea tensional", indicaciones: "   " }));
  assert.equal(out, "Paciente. Diagnóstico: cefalea tensional.");
  assert.doesNotMatch(out, /Se indica \./);
});

// ---------------------------------------------------------------------------
// Síntomas — unión con "y" final, filtrado de "Otro"
// ---------------------------------------------------------------------------
test("un solo síntoma: sin comas ni 'y'", () => {
  const out = componerEvolucion(datos({ sintomas: ["Fiebre"], plazo: "Menos de 24 horas" }));
  assert.equal(out, "Paciente. Refiere fiebre de menos de 24 horas de evolución.");
});

test("dos síntomas: une con ' y '", () => {
  const out = componerEvolucion(datos({ sintomas: ["Fiebre", "Tos"], plazo: "1-3 días" }));
  assert.equal(out, "Paciente. Refiere fiebre y tos de 1 a 3 días de evolución.");
});

test("tres o más síntomas: comas y ' y ' antes del último", () => {
  const out = componerEvolucion(
    datos({ sintomas: ["Fiebre", "Dolor de garganta", "Tos", "Congestión nasal"], plazo: "4-7 días" })
  );
  assert.equal(
    out,
    "Paciente. Refiere fiebre, dolor de garganta, tos y congestión nasal de 4 a 7 días de evolución."
  );
});

test("filtra 'Otro' (case-insensitive) del listado de síntomas", () => {
  const out = componerEvolucion(datos({ sintomas: ["Fiebre", "Otro", "Tos"], plazo: "1-3 días" }));
  assert.equal(out, "Paciente. Refiere fiebre y tos de 1 a 3 días de evolución.");
});

test("solo 'Otro' como síntoma: omite la frase 'Refiere...' por completo", () => {
  const out = componerEvolucion(
    datos({ motivo: "consulta dermatológica", sintomas: ["Otro"], plazo: "1-3 días" })
  );
  assert.equal(out, "Paciente. Consulta por consulta dermatológica.");
  assert.doesNotMatch(out, /Refiere/);
});

test("síntomas presentes pero sin plazo: 'Refiere ...' sin cola de evolución", () => {
  const out = componerEvolucion(datos({ sintomas: ["Fiebre", "Tos"], plazo: null }));
  assert.equal(out, "Paciente. Refiere fiebre y tos.");
  assert.doesNotMatch(out, /de evolución/);
});

// ---------------------------------------------------------------------------
// Transformación de plazo — TODOS los valores reales del triage
// ---------------------------------------------------------------------------
const CASOS_PLAZO: Array<[string, string]> = [
  ["Menos de 24 horas", "de menos de 24 horas de evolución"],
  ["1-3 días", "de 1 a 3 días de evolución"],
  ["4-7 días", "de 4 a 7 días de evolución"],
  ["1-2 semanas", "de 1 a 2 semanas de evolución"],
  ["Más de 2 semanas", "de más de 2 semanas de evolución"],
  ["Más de 1 mes", "de más de 1 mes de evolución"],
];

for (const [crudo, esperado] of CASOS_PLAZO) {
  test(`plazo "${crudo}" → "${esperado}"`, () => {
    const out = componerEvolucion(datos({ sintomas: ["Fiebre"], plazo: crudo }));
    assert.equal(out, `Paciente. Refiere fiebre ${esperado}.`);
  });
}

test("plazo no mapeado: degrada al texto crudo sin romper", () => {
  const out = componerEvolucion(datos({ sintomas: ["Fiebre"], plazo: "hace un rato" }));
  assert.equal(out, "Paciente. Refiere fiebre de hace un rato de evolución.");
});

// ---------------------------------------------------------------------------
// Apertura demográfica tolerante a faltantes
// ---------------------------------------------------------------------------
test("edad faltante: 'Paciente masculino.' (sin 'de null años')", () => {
  const out = componerEvolucion(datos({ edad: null, sexo: "masculino", diagnostico: "gripe" }));
  assert.equal(out, "Paciente masculino. Diagnóstico: gripe.");
  assert.doesNotMatch(out, /null|undefined|de\s+años/);
});

test("sexo faltante: 'Paciente de 47 años.'", () => {
  const out = componerEvolucion(datos({ edad: 47, sexo: null, diagnostico: "gripe" }));
  assert.equal(out, "Paciente de 47 años. Diagnóstico: gripe.");
});

test("edad 0 es válida (lactante): 'Paciente de 0 años.'", () => {
  const out = componerEvolucion(datos({ edad: 0, sexo: "femenino" }));
  assert.equal(out, "Paciente de 0 años, femenino.");
});

// ---------------------------------------------------------------------------
// Comentario — sin rótulo, termina en punto
// ---------------------------------------------------------------------------
test("comentario presente: se concatena como frase, sin rótulo, con punto", () => {
  const out = componerEvolucion(
    datos({ diagnostico: "faringitis", comentario: "Se sugiere control si persiste la fiebre" })
  );
  assert.equal(
    out,
    "Paciente. Diagnóstico: faringitis. Se sugiere control si persiste la fiebre."
  );
  assert.doesNotMatch(out, /Comentarios adicionales/i);
});

test("comentario que ya termina en punto: no duplica el punto", () => {
  const out = componerEvolucion(datos({ diagnostico: "faringitis", comentario: "Control en 48 hs." }));
  assert.equal(out, "Paciente. Diagnóstico: faringitis. Control en 48 hs.");
  assert.doesNotMatch(out, /\.\./);
});

test("comentario ausente: no agrega nada al final", () => {
  const out = componerEvolucion(datos({ diagnostico: "faringitis", comentario: null }));
  assert.equal(out, "Paciente. Diagnóstico: faringitis.");
});

// ---------------------------------------------------------------------------
// No tocar capitalización del médico
// ---------------------------------------------------------------------------
test("respeta capitalización del médico en dx/indicaciones/receta", () => {
  const out = componerEvolucion(
    datos({
      diagnostico: "COVID-19",
      indicaciones: "Aislamiento por 5 días",
      receta: "Rp/ PARACETAMOL 500 mg",
    })
  );
  assert.equal(
    out,
    "Paciente. Diagnóstico: COVID-19. Se indica Aislamiento por 5 días. Se prescribe Rp/ PARACETAMOL 500 mg."
  );
});
