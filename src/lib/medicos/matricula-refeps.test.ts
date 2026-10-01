// El número de matrícula lo dice REFEPS: un dígito mal tipeado no puede dejar a
// un profesional trabado esperando que alguien lo corrija a mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import { claveMatricula, cruzarMatricula, jurisdiccionDeclarada, slugConMatricula } from "./matricula-refeps";

const MN = (numero: string) => ({ tipo_matricula: "MN", numero_matricula: numero, provincia_matricula: null });
const MP = (numero: string, provincia: string | null) => ({ tipo_matricula: "MP", numero_matricula: numero, provincia_matricula: provincia });

test("clave: solo dígitos y sin ceros a la izquierda (M01234 = 1234)", () => {
  assert.equal(claveMatricula("M01234"), "1234");
  assert.equal(claveMatricula(" 1234 "), "1234");
  assert.equal(claveMatricula("M-1234"), "1234");
  assert.equal(claveMatricula("sin número"), "");
  assert.equal(claveMatricula(null), "");
});

test("jurisdicción declarada: MN es CABA; MP es su provincia; MP sin provincia no se sabe", () => {
  assert.equal(jurisdiccionDeclarada(MN("1")), "CABA");
  assert.equal(jurisdiccionDeclarada(MP("1", "Santa Fe")), "Santa Fe");
  assert.equal(jurisdiccionDeclarada(MP("1", null)), null);
  assert.equal(jurisdiccionDeclarada({ tipo_matricula: "XX", numero_matricula: "1", provincia_matricula: null }), null);
});

test("el número declarado figura en REFEPS → coincide (en cualquier jurisdicción, como siempre)", () => {
  const refeps = [{ numero: "111111", tipo: "CABA", habilitada: true }, { numero: "2222", tipo: "Chaco", habilitada: true }];
  assert.deepEqual(cruzarMatricula(MN("111111"), refeps), { resultado: "coincide" });
  // Declaró MN pero escribió el número provincial: sigue siendo suyo.
  assert.deepEqual(cruzarMatricula(MN("2222"), refeps), { resultado: "coincide" });
});

test("diferencia solo de formato (letra y cero adelante) → coincide, no es un error", () => {
  const refeps = [{ numero: "M01234", tipo: "Misiones", habilitada: true }];
  assert.deepEqual(cruzarMatricula(MP("1234", "Misiones"), refeps), { resultado: "coincide" });
});

test("EL CASO: un dígito mal tipeado → se adopta la de REFEPS de esa jurisdicción", () => {
  // Declaró MN 128456; REFEPS tiene una sola de CABA para ese DNI.
  assert.deepEqual(cruzarMatricula(MN("128456"), [{ numero: "123456", tipo: "CABA", habilitada: true }]), {
    resultado: "adoptar",
    numero: "123456",
    jurisdiccion: "CABA",
  });
  // Con otra matrícula en otra provincia, se adopta la de la jurisdicción declarada.
  assert.deepEqual(
    cruzarMatricula(MN("654821"), [
      { numero: "654321", tipo: "CABA", habilitada: true },
      { numero: "4321", tipo: "Chaco", habilitada: true },
    ]),
    { resultado: "adoptar", numero: "654321", jurisdiccion: "CABA" }
  );
  assert.deepEqual(
    cruzarMatricula(MP("9999", "Chaco"), [
      { numero: "654321", tipo: "CABA", habilitada: true },
      { numero: "4321", tipo: "Chaco", habilitada: true },
    ]),
    { resultado: "adoptar", numero: "4321", jurisdiccion: "Chaco" }
  );
});

test("la misma matrícula repetida en REFEPS cuenta una vez", () => {
  const refeps = [
    { numero: "123456", tipo: "CABA", habilitada: true },
    { numero: "123456", tipo: "CABA", habilitada: true },
  ];
  assert.equal(cruzarMatricula(MN("128456"), refeps).resultado, "adoptar");
});

test("declaró una jurisdicción que REFEPS no tiene para ese DNI → revisar, no se adivina", () => {
  assert.deepEqual(cruzarMatricula(MP("M09999", "Misiones"), [{ numero: "111222", tipo: "CABA", habilitada: true }]), {
    resultado: "revisar",
    motivo: "jurisdiccion_no_figura",
    jurisdiccion: "Misiones",
  });
});

test("dos matrículas habilitadas distintas en la misma jurisdicción → revisar", () => {
  const refeps = [
    { numero: "100", tipo: "CABA", habilitada: true },
    { numero: "200", tipo: "CABA", habilitada: true },
  ];
  assert.deepEqual(cruzarMatricula(MN("300"), refeps), { resultado: "revisar", motivo: "varias_en_jurisdiccion", jurisdiccion: "CABA" });
});

test("la única de esa jurisdicción no está habilitada → revisar (no se adopta una matrícula inhabilitada)", () => {
  assert.deepEqual(cruzarMatricula(MN("300"), [{ numero: "100", tipo: "CABA", habilitada: false }]), {
    resultado: "revisar",
    motivo: "no_habilitada",
    jurisdiccion: "CABA",
  });
  // Una habilitada y una no: se adopta la habilitada.
  assert.deepEqual(
    cruzarMatricula(MN("300"), [
      { numero: "100", tipo: "CABA", habilitada: false },
      { numero: "200", tipo: "CABA", habilitada: true },
    ]),
    { resultado: "adoptar", numero: "200", jurisdiccion: "CABA" }
  );
});

test("MP sin provincia y el número no figura → revisar", () => {
  assert.deepEqual(cruzarMatricula(MP("300", null), [{ numero: "100", tipo: "Salta", habilitada: true }]), {
    resultado: "revisar",
    motivo: "jurisdiccion_declarada_desconocida",
    jurisdiccion: null,
  });
});

test("sin número declarado nunca 'coincide' por vacío; REFEPS sin matrículas → revisar", () => {
  assert.equal(cruzarMatricula(MN(""), [{ numero: "", tipo: "CABA", habilitada: true }]).resultado, "revisar");
  assert.equal(cruzarMatricula(MN("123"), []).resultado, "revisar");
  assert.equal(cruzarMatricula(MN("123"), null).resultado, "revisar");
});

test("el slug del perfil sigue al número corregido; lo que no reconoce no lo toca", () => {
  assert.equal(slugConMatricula("ana-perez-MN128456", "MN", "128456", "123456"), "ana-perez-MN123456");
  assert.equal(slugConMatricula("ana-perez-otra-cosa", "MN", "128456", "123456"), null);
  assert.equal(slugConMatricula(null, "MN", "128456", "123456"), null);
});
