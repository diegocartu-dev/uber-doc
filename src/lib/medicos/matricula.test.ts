import { test } from "node:test";
import assert from "node:assert/strict";
import { cambiaMatricula } from "./matricula";

const guardada = { tipo_matricula: "MN", numero_matricula: "123456" };

test("EL BUG: reenviar la misma matrícula sin tocarla NO es un cambio", () => {
  // El formulario manda el perfil entero aunque solo se haya editado el celular.
  // Antes esto disparaba un 403 y dejaba al profesional sin poder corregir su
  // teléfono — el número al que le llegan los avisos de pacientes.
  assert.equal(cambiaMatricula({ tipo_matricula: "MN", numero_matricula: "123456" }, guardada), false);
});

test("el gate A1 SIGUE bloqueando un cambio real", () => {
  assert.equal(cambiaMatricula({ numero_matricula: "999999" }, guardada), true);
  assert.equal(cambiaMatricula({ tipo_matricula: "MP" }, guardada), true);
});

test("un campo ausente no cuenta como cambio", () => {
  assert.equal(cambiaMatricula({}, guardada), false);
  assert.equal(cambiaMatricula({ tipo_matricula: undefined }, guardada), false);
});

test("null y cadena vacía son lo mismo, y borrar sí es un cambio", () => {
  assert.equal(cambiaMatricula({ numero_matricula: null }, { numero_matricula: "" }), false);
  assert.equal(cambiaMatricula({ numero_matricula: null }, guardada), true);
});

test("sin fila guardada, cualquier valor real es un cambio", () => {
  assert.equal(cambiaMatricula({ numero_matricula: "123456" }, null), true);
  assert.equal(cambiaMatricula({ numero_matricula: null }, null), false);
});
