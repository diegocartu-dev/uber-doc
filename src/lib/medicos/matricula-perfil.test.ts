// Lo que Mi perfil le ofrece al profesional para cambiar su matrícula.
// Números sintéticos. Ejecutar:  npx tsx --test src/lib/medicos/matricula-perfil.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { matriculaEnPerfil, mensajeParaProfesional, ubicarEleccion, type FichaParaPerfil } from "./matricula-perfil";

const deRefeps = {
  matriculas: [
    { tipo: "Salta", numero: "4001", habilitada: true, profesion: "Médico" },
    { tipo: "CABA", numero: "900001", habilitada: false, profesion: "Médico" },
    { tipo: "Jujuy", numero: "4002", habilitada: true, profesion: "Médico" },
    { tipo: "Jujuy", numero: "777", habilitada: true, profesion: "Licenciado en Psicología" },
  ],
};

const validada: FichaParaPerfil = {
  tipo_matricula: "MN",
  numero_matricula: "900001",
  provincia_matricula: null,
  identidad_validada: true,
  didit_status: "Approved",
  refeps_data: deRefeps,
  es_cuenta_test: false,
  profesion: "medico",
};

test("sin la identidad validada no hay nada que mostrar: la pantalla sigue como antes", () => {
  assert.equal(matriculaEnPerfil({ ...validada, identidad_validada: false }, false), null);
  assert.equal(matriculaEnPerfil({ ...validada, identidad_validada: null }, false), null);
  assert.equal(matriculaEnPerfil(null, false), null);
});

test("validada: muestra la de la ficha y ofrece solo las otras habilitadas de su profesión", () => {
  assert.deepEqual(matriculaEnPerfil(validada, false), {
    etiqueta: "MN 900001",
    otras: [
      { tipo: "Salta", numero: "4001", etiqueta: "MP 4001 (Salta)" },
      { tipo: "Jujuy", numero: "4002", etiqueta: "MP 4002 (Jujuy)" },
    ],
  });
});

test("la que ya tiene no se le ofrece, y una inhabilitada tampoco (no puede volver a ella)", () => {
  const enJujuy = { ...validada, tipo_matricula: "MP", numero_matricula: "4002", provincia_matricula: "Jujuy" };
  assert.deepEqual(matriculaEnPerfil(enJujuy, false), {
    etiqueta: "MP 4002 (Jujuy)",
    otras: [{ tipo: "Salta", numero: "4001", etiqueta: "MP 4001 (Salta)" }],
  });
});

test("no se ofrece nada sin biometría aprobada, a una cuenta de prueba ni en la instancia institucional", () => {
  const soloFigura = { etiqueta: "MN 900001", otras: [] };
  assert.deepEqual(matriculaEnPerfil({ ...validada, didit_status: "In Review" }, false), soloFigura);
  assert.deepEqual(matriculaEnPerfil({ ...validada, didit_status: null }, false), soloFigura);
  assert.deepEqual(matriculaEnPerfil({ ...validada, es_cuenta_test: true }, false), soloFigura);
  assert.deepEqual(matriculaEnPerfil(validada, true), soloFigura);
});

test("lo guardado de REFEPS con otra forma (o vacío) no rompe: no ofrece nada", () => {
  for (const refeps_data of [null, {}, { matriculas: "x" }, { matriculas: [{ tipo: null, numero: null, habilitada: true }] }, "texto"]) {
    assert.deepEqual(matriculaEnPerfil({ ...validada, refeps_data }, false), { etiqueta: "MN 900001", otras: [] });
  }
});

test("un psicólogo solo ve matrículas de psicología", () => {
  const psi = { ...validada, profesion: "psicologo", tipo_matricula: "MP", numero_matricula: "1", provincia_matricula: "Salta" };
  assert.deepEqual(matriculaEnPerfil(psi, false)?.otras, [{ tipo: "Jujuy", numero: "777", etiqueta: "MP 777 (Jujuy)" }]);
});

test("todo motivo tiene su texto, y solo se afirma «no se cambió nada» cuando se sabe", () => {
  const motivos = ["no_disponible", "identidad", "transitorio", "refeps", "no_habilitada", "ya_es", "duplicada", "cambio_mientras", "error"] as const;
  for (const m of motivos) assert.ok(mensajeParaProfesional(m).length > 10, m);
  // "error" cubre el caso en que no se pudo confirmar qué quedó guardado.
  assert.ok(!mensajeParaProfesional("error").includes("No se cambió nada"));
});

test("la elección: solo una de sus opciones pasa, y a cada rechazo se le dice lo que es", () => {
  assert.deepEqual(ubicarEleccion(validada, false, { tipo: "Jujuy", numero: "4002" }), {
    es: "opcion",
    opcion: { tipo: "Jujuy", numero: "4002", etiqueta: "MP 4002 (Jujuy)" },
  });
  // Se compara normalizado, como la puerta: espacios o mayúsculas no la esconden.
  assert.equal(ubicarEleccion(validada, false, { tipo: " jujuy ", numero: " 4002 " }).es, "opcion");
  const conEspacio = { ...validada, refeps_data: { matriculas: [{ tipo: "Jujuy", numero: " 4002 ", habilitada: true, profesion: "Médico" }] } };
  assert.equal(ubicarEleccion(conEspacio, false, { tipo: "Jujuy", numero: "4002" }).es, "opcion");
  // La que ya tiene (una pestaña vieja).
  assert.equal(ubicarEleccion(validada, false, { tipo: "CABA", numero: "900001" }).es, "la_suya");
  // Un número que nadie le ofreció, la de otra profesión, la de otra jurisdicción.
  assert.equal(ubicarEleccion(validada, false, { tipo: "Jujuy", numero: "9999" }).es, "fuera_de_lista");
  assert.equal(ubicarEleccion(validada, false, { tipo: "Jujuy", numero: "777" }).es, "fuera_de_lista");
  assert.equal(ubicarEleccion(validada, false, { tipo: "Salta", numero: "4002" }).es, "fuera_de_lista");
  assert.equal(ubicarEleccion(validada, false, { tipo: "", numero: "" }).es, "fuera_de_lista");
  // A quien no se le ofrece nada.
  assert.equal(ubicarEleccion({ ...validada, identidad_validada: false }, false, { tipo: "Jujuy", numero: "4002" }).es, "no_disponible");
  assert.equal(ubicarEleccion({ ...validada, es_cuenta_test: true }, false, { tipo: "Jujuy", numero: "4002" }).es, "no_disponible");
  assert.equal(ubicarEleccion({ ...validada, didit_status: "In Review" }, false, { tipo: "Jujuy", numero: "4002" }).es, "no_disponible");
  assert.equal(ubicarEleccion(validada, true, { tipo: "Jujuy", numero: "4002" }).es, "no_disponible");
  assert.equal(ubicarEleccion(null, false, { tipo: "Jujuy", numero: "4002" }).es, "no_disponible");
});
