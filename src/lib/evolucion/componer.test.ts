// Tests de componerEvolucion — runner: node:test + node:assert, corridos con tsx.
// Ejecutar:  npx tsx --test src/lib/evolucion/componer.test.ts
//
// Formato bajo test: transcripción corrida "etiqueta: contenido", secciones
// separadas por ". ", string terminado en ".". Ver componer.ts.
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
// EJEMPLO CANÓNICO DE DIEGO — string exacto. Este es el test más importante.
// ---------------------------------------------------------------------------
test("ejemplo de Diego: matchea EXACTO el string esperado", () => {
  const out = componerEvolucion(
    datos({
      edad: 38,
      sexo: "masculino",
      motivo: "le duele mucho la panza",
      sintomas: ["Dolor abdominal", "Fiebre"],
      plazo: "1-3 días",
      diagnostico: "gastroenteritis aguda",
      indicaciones: "dieta blanda y reposo 48 hs",
      receta: "Rp/ buscapina 10 mg, cápsulas blandas, 1 comprimido cada 8 hs",
      comentario: "paciente alérgico al sertal",
    })
  );
  assert.equal(
    out,
    "paciente: masculino, de 38 años. " +
      "refiere al ingreso: le duele mucho la panza, dolor abdominal, fiebre hace 1-3 días. " +
      "se diagnostica: gastroenteritis aguda. " +
      "se indica: buscapina 10 mg, cápsulas blandas, 1 comprimido cada 8 hs, dieta blanda y reposo 48 hs. " +
      "comentarios adicionales: paciente alérgico al sertal."
  );
});

// ---------------------------------------------------------------------------
// sección paciente — sexo primero, después edad
// ---------------------------------------------------------------------------
test("paciente: sexo primero, edad después", () => {
  const out = componerEvolucion(datos({ edad: 47, sexo: "femenino", diagnostico: "gripe" }));
  assert.equal(out, "paciente: femenino, de 47 años. se diagnostica: gripe.");
});

test("edad 0 es válida (lactante): 'de 0 años'", () => {
  const out = componerEvolucion(datos({ edad: 0, sexo: "femenino", diagnostico: "control sano" }));
  assert.equal(out, "paciente: femenino, de 0 años. se diagnostica: control sano.");
});

test("defensivo: edad corrupta (null) → no imprime 'de null años', solo sexo", () => {
  const out = componerEvolucion(datos({ edad: null, sexo: "masculino", diagnostico: "gripe" }));
  assert.equal(out, "paciente: masculino. se diagnostica: gripe.");
  assert.doesNotMatch(out, /null|undefined|de\s+años/);
});

test("defensivo: sexo corrupto (null) → solo edad", () => {
  const out = componerEvolucion(datos({ edad: 47, sexo: null, diagnostico: "gripe" }));
  assert.equal(out, "paciente: de 47 años. se diagnostica: gripe.");
});

// ---------------------------------------------------------------------------
// refiere al ingreso — motivo + síntomas + plazo, y variantes defensivas
// ---------------------------------------------------------------------------
test("refiere: motivo + síntomas + plazo, síntomas con comas", () => {
  const out = componerEvolucion(
    datos({
      edad: 30,
      sexo: "masculino",
      motivo: "me duele la cabeza",
      sintomas: ["Cefalea", "Náuseas"],
      plazo: "Menos de 24 horas",
      diagnostico: "cefalea tensional",
    })
  );
  assert.equal(
    out,
    "paciente: masculino, de 30 años. " +
      "refiere al ingreso: me duele la cabeza, cefalea, náuseas hace menos de 24 horas. " +
      "se diagnostica: cefalea tensional."
  );
});

test("turno SIN triage: omite por completo 'refiere al ingreso'", () => {
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
    "paciente: femenino, de 62 años. " +
      "se diagnostica: hipertensión arterial controlada. " +
      "se indica: continuar con enalapril 10 mg/día y control en 30 días."
  );
  assert.doesNotMatch(out, /refiere al ingreso/);
});

test("refiere defensivo: solo motivo (sin síntomas)", () => {
  const out = componerEvolucion(
    datos({ edad: 40, sexo: "femenino", motivo: "control de rutina", diagnostico: "paciente sana" })
  );
  assert.equal(
    out,
    "paciente: femenino, de 40 años. refiere al ingreso: control de rutina. se diagnostica: paciente sana."
  );
});

test("refiere defensivo: solo síntomas con plazo (sin motivo)", () => {
  const out = componerEvolucion(
    datos({ edad: 25, sexo: "masculino", sintomas: ["Fiebre", "Tos"], plazo: "4-7 días", diagnostico: "viral" })
  );
  assert.equal(
    out,
    "paciente: masculino, de 25 años. refiere al ingreso: fiebre, tos hace 4-7 días. se diagnostica: viral."
  );
});

test("refiere defensivo: síntomas sin plazo → sin 'hace ...'", () => {
  const out = componerEvolucion(
    datos({ edad: 25, sexo: "masculino", sintomas: ["Fiebre", "Tos"], plazo: null, diagnostico: "viral" })
  );
  assert.equal(
    out,
    "paciente: masculino, de 25 años. refiere al ingreso: fiebre, tos. se diagnostica: viral."
  );
  assert.doesNotMatch(out, /hace/);
});

test("refiere defensivo: motivo + síntomas sin plazo", () => {
  const out = componerEvolucion(
    datos({ edad: 25, sexo: "masculino", motivo: "no me siento bien", sintomas: ["Fiebre"], plazo: null, diagnostico: "viral" })
  );
  assert.equal(
    out,
    "paciente: masculino, de 25 años. refiere al ingreso: no me siento bien, fiebre. se diagnostica: viral."
  );
});

// ---------------------------------------------------------------------------
// Síntomas — filtrado de "Otro", enumeración con comas
// ---------------------------------------------------------------------------
test("filtra 'Otro' (case-insensitive) del listado de síntomas", () => {
  const out = componerEvolucion(
    datos({ edad: 30, sexo: "femenino", sintomas: ["Fiebre", "Otro", "Tos"], plazo: "1-3 días", diagnostico: "viral" })
  );
  assert.equal(
    out,
    "paciente: femenino, de 30 años. refiere al ingreso: fiebre, tos hace 1-3 días. se diagnostica: viral."
  );
});

test("solo 'Otro' como síntoma: con motivo presente queda solo el motivo", () => {
  const out = componerEvolucion(
    datos({ edad: 30, sexo: "femenino", motivo: "consulta dermatológica", sintomas: ["Otro"], plazo: "1-3 días", diagnostico: "dermatitis" })
  );
  assert.equal(
    out,
    "paciente: femenino, de 30 años. refiere al ingreso: consulta dermatológica. se diagnostica: dermatitis."
  );
  assert.doesNotMatch(out, /hace/);
});

test("solo 'Otro' como síntoma y sin motivo: omite 'refiere al ingreso'", () => {
  const out = componerEvolucion(
    datos({ edad: 30, sexo: "femenino", sintomas: ["Otro"], plazo: "1-3 días", diagnostico: "dermatitis" })
  );
  assert.equal(out, "paciente: femenino, de 30 años. se diagnostica: dermatitis.");
  assert.doesNotMatch(out, /refiere al ingreso/);
});

test("un solo síntoma: sin comas internas", () => {
  const out = componerEvolucion(
    datos({ edad: 30, sexo: "masculino", sintomas: ["Fiebre"], plazo: "1-3 días", diagnostico: "viral" })
  );
  assert.equal(
    out,
    "paciente: masculino, de 30 años. refiere al ingreso: fiebre hace 1-3 días. se diagnostica: viral."
  );
});

// ---------------------------------------------------------------------------
// "hace {plazo}" — TODOS los valores reales del triage (TIEMPO_OPCIONES)
// ---------------------------------------------------------------------------
const CASOS_PLAZO: Array<[string, string]> = [
  ["Menos de 24 horas", "hace menos de 24 horas"],
  ["1-3 días", "hace 1-3 días"],
  ["4-7 días", "hace 4-7 días"],
  ["1-2 semanas", "hace 1-2 semanas"],
  ["Más de 2 semanas", "hace más de 2 semanas"],
  ["Más de 1 mes", "hace más de 1 mes"],
];

for (const [crudo, esperado] of CASOS_PLAZO) {
  test(`plazo "${crudo}" → "${esperado}"`, () => {
    const out = componerEvolucion(
      datos({ edad: 30, sexo: "masculino", sintomas: ["Fiebre"], plazo: crudo, diagnostico: "viral" })
    );
    assert.equal(
      out,
      `paciente: masculino, de 30 años. refiere al ingreso: fiebre ${esperado}. se diagnostica: viral.`
    );
  });
}

// ---------------------------------------------------------------------------
// se indica — RECETA PRIMERO, strip de "Rp/", variantes solo-receta / solo-indic
// ---------------------------------------------------------------------------
test("se indica: receta PRIMERO, indicaciones después", () => {
  const out = componerEvolucion(
    datos({
      edad: 50,
      sexo: "masculino",
      diagnostico: "faringitis",
      indicaciones: "reposo e hidratación",
      receta: "Rp/ amoxicilina 500 mg, 1 comprimido cada 8 hs por 7 días",
    })
  );
  assert.equal(
    out,
    "paciente: masculino, de 50 años. se diagnostica: faringitis. " +
      "se indica: amoxicilina 500 mg, 1 comprimido cada 8 hs por 7 días, reposo e hidratación."
  );
});

test("strip de 'Rp/ ' (con espacio) en se indica", () => {
  const out = componerEvolucion(
    datos({ edad: 50, sexo: "masculino", diagnostico: "x", receta: "Rp/ paracetamol 500 mg" })
  );
  assert.equal(out, "paciente: masculino, de 50 años. se diagnostica: x. se indica: paracetamol 500 mg.");
  assert.doesNotMatch(out, /Rp\//);
});

test("strip de 'Rp/' (sin espacio) en se indica", () => {
  const out = componerEvolucion(
    datos({ edad: 50, sexo: "masculino", diagnostico: "x", receta: "Rp/paracetamol 500 mg" })
  );
  assert.equal(out, "paciente: masculino, de 50 años. se diagnostica: x. se indica: paracetamol 500 mg.");
  assert.doesNotMatch(out, /Rp\//);
});

test("se indica con solo receta (sin indicaciones)", () => {
  const out = componerEvolucion(
    datos({ edad: 50, sexo: "femenino", diagnostico: "infección", receta: "Rp/ cefalexina 500 mg" })
  );
  assert.equal(out, "paciente: femenino, de 50 años. se diagnostica: infección. se indica: cefalexina 500 mg.");
});

test("se indica con solo indicaciones (sin receta)", () => {
  const out = componerEvolucion(
    datos({ edad: 50, sexo: "femenino", diagnostico: "contractura", indicaciones: "reposo y calor local" })
  );
  assert.equal(out, "paciente: femenino, de 50 años. se diagnostica: contractura. se indica: reposo y calor local.");
});

test("sin receta NI indicaciones: omite 'se indica' por completo (no inventa cierre)", () => {
  const out = componerEvolucion(
    datos({ edad: 50, sexo: "femenino", motivo: "control", diagnostico: "paciente sana" })
  );
  assert.equal(
    out,
    "paciente: femenino, de 50 años. refiere al ingreso: control. se diagnostica: paciente sana."
  );
  assert.doesNotMatch(out, /se indica/);
});

// ---------------------------------------------------------------------------
// comentarios adicionales — se omite si no hay
// ---------------------------------------------------------------------------
test("sin comentario: no agrega 'comentarios adicionales'", () => {
  const out = componerEvolucion(
    datos({ edad: 40, sexo: "masculino", diagnostico: "cefalea", comentario: null })
  );
  assert.equal(out, "paciente: masculino, de 40 años. se diagnostica: cefalea.");
  assert.doesNotMatch(out, /comentarios adicionales/);
});

test("comentario en blanco no deja 'comentarios adicionales: ' colgando", () => {
  const out = componerEvolucion(
    datos({ edad: 40, sexo: "masculino", diagnostico: "cefalea", comentario: "   " })
  );
  assert.equal(out, "paciente: masculino, de 40 años. se diagnostica: cefalea.");
  assert.doesNotMatch(out, /comentarios adicionales/);
});

test("comentario presente: se transcribe tal cual tras la etiqueta", () => {
  const out = componerEvolucion(
    datos({ edad: 40, sexo: "masculino", diagnostico: "faringitis", comentario: "Control si persiste la fiebre" })
  );
  assert.equal(
    out,
    "paciente: masculino, de 40 años. se diagnostica: faringitis. comentarios adicionales: Control si persiste la fiebre."
  );
});

// ---------------------------------------------------------------------------
// se diagnostica — obligatorio en la práctica, pero defensivo si falta
// ---------------------------------------------------------------------------
test("sin diagnóstico: omite 'se diagnostica' (defensivo)", () => {
  const out = componerEvolucion(
    datos({ edad: 40, sexo: "masculino", motivo: "consulta", diagnostico: null, indicaciones: "reposo" })
  );
  assert.equal(
    out,
    "paciente: masculino, de 40 años. refiere al ingreso: consulta. se indica: reposo."
  );
  assert.doesNotMatch(out, /se diagnostica/);
});

test("respeta capitalización del médico en dx/receta/indicaciones/comentario", () => {
  const out = componerEvolucion(
    datos({
      edad: 33,
      sexo: "femenino",
      diagnostico: "COVID-19",
      indicaciones: "Aislamiento por 5 días",
      receta: "Rp/ PARACETAMOL 500 mg",
      comentario: "Reevaluar en 48 HS",
    })
  );
  assert.equal(
    out,
    "paciente: femenino, de 33 años. se diagnostica: COVID-19. " +
      "se indica: PARACETAMOL 500 mg, Aislamiento por 5 días. comentarios adicionales: Reevaluar en 48 HS."
  );
});

// ---------------------------------------------------------------------------
// Armado — sin secciones colgadas, cierre con un solo punto
// ---------------------------------------------------------------------------
test("todo null: devuelve string vacío (sin secciones, sin punto suelto)", () => {
  const out = componerEvolucion(datos({}));
  assert.equal(out, "");
});

test("string termina siempre en un único punto, sin '..' ni ': .'", () => {
  const out = componerEvolucion(
    datos({ edad: 30, sexo: "masculino", diagnostico: "x", receta: "Rp/ y", comentario: "z." })
  );
  // El comentario ya trae punto; el armado NO duplica el cierre → un solo punto.
  assert.equal(out, "paciente: masculino, de 30 años. se diagnostica: x. se indica: y. comentarios adicionales: z.");
  assert.doesNotMatch(out, /\.\./);
});

// ---------------------------------------------------------------------------
// GUARD anti-invención — la PLANTILLA no agrega andamiaje clínico por su cuenta.
// El guard corre sobre salidas cuyo CONTENIDO HUMANO no trae esas palabras, de
// modo que cualquier match probaría que la plantilla las inyectó. (El comentario
// del médico SÍ puede contener "alérgico", "alergia", etc. — eso es contenido
// humano, no se audita; ver test del ejemplo de Diego "alérgico al sertal".)
// ---------------------------------------------------------------------------
test("guard: la plantilla no inventa pautas de alarma / alergias / signos vitales / examen físico", () => {
  const out = componerEvolucion(
    datos({
      edad: 47,
      sexo: "masculino",
      motivo: "control de rutina",
      sintomas: ["Fiebre", "Tos"],
      plazo: "1-3 días",
      diagnostico: "cuadro viral",
      indicaciones: "reposo e hidratación",
      receta: "Rp/ paracetamol 500 mg",
      // SIN comentario con esas palabras: cualquier match vendría de la plantilla.
    })
  );
  assert.doesNotMatch(out, /alarma|alergia|niega|signos vitales|examen físico/i);
});
