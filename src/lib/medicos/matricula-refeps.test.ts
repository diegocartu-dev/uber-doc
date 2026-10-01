// El número de matrícula lo dice REFEPS: un dígito mal tipeado no puede dejar a
// un profesional trabado esperando que alguien lo corrija a mano. Y nada de lo
// que se adopte puede ser una matrícula que no es de médico, que no está
// habilitada, o que REFEPS no le da a esa persona.
// Todos los números son sintéticos.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cruzarMatricula,
  declaradaDesdeRefeps,
  esLaDeLaFicha,
  esMatriculaDeMedico,
  etiquetaMatricula,
  jurisdiccionDeclarada,
  motivoRevisionHumano,
  normalizarNumeroMatricula,
  slugConMatricula,
} from "./matricula-refeps";
import { derivarJurisdicciones } from "../jurisdicciones";
import { esDeOtraProfesion } from "../refeps/profesion";
import { diagnosticoSinPisar } from "../refeps/persistir-diagnostico";

const MN = (numero: string) => ({ tipo_matricula: "MN", numero_matricula: numero, provincia_matricula: null });
const MP = (numero: string, provincia: string | null) => ({ tipo_matricula: "MP", numero_matricula: numero, provincia_matricula: provincia });
const med = (numero: string, tipo: string, habilitada = true) => ({ numero, tipo, habilitada, profesion: "Médico" });

test("forma comparable: mayúsculas y sin separadores; letras y ceros a la izquierda se conservan", () => {
  assert.equal(normalizarNumeroMatricula(" m-01.234 "), "M01234");
  assert.notEqual(normalizarNumeroMatricula("M1234"), normalizarNumeroMatricula("K1234"));
  assert.notEqual(normalizarNumeroMatricula("01234"), normalizarNumeroMatricula("1234"));
  assert.equal(normalizarNumeroMatricula(null), "");
});

test("jurisdicción declarada: MN es CABA; MP es la provincia DE LA MATRÍCULA (nunca la del consultorio); MP sin provincia no se sabe", () => {
  assert.equal(jurisdiccionDeclarada(MN("1")), "CABA");
  assert.equal(jurisdiccionDeclarada(MP("1", "Santa Fe")), "Santa Fe");
  // `medicos.provincia` (la del consultorio, que guarda el onboarding) no entra:
  // ni siquiera es parte del tipo que recibe el cruce.
  assert.equal(jurisdiccionDeclarada({ ...MP("1", "Buenos Aires"), provincia: "CABA" } as Parameters<typeof jurisdiccionDeclarada>[0]), "Buenos Aires");
  assert.equal(jurisdiccionDeclarada(MP("1", null)), null);
  assert.equal(jurisdiccionDeclarada({ tipo_matricula: "XX", numero_matricula: "1", provincia_matricula: null }), null);
});

test("coincide: el número tal cual, de médico, habilitado, en la jurisdicción declarada", () => {
  const refeps = [med("111111", "CABA"), med("2222", "Chaco")];
  assert.deepEqual(cruzarMatricula(MN("111111"), refeps), { resultado: "coincide" });
  assert.deepEqual(cruzarMatricula(MP("2222", "Chaco"), refeps), { resultado: "coincide" });
  // Solo separadores distintos: coincide.
  assert.deepEqual(cruzarMatricula(MP("m-2222", "Misiones"), [med("M2222", "Misiones")]), { resultado: "coincide" });
});

test("coincide exige la ficha escrita como REFEPS: una 'MP de CABA' con el número de la Nacional se corrige a MN", () => {
  assert.deepEqual(cruzarMatricula(MP("123456", "CABA"), [med("123456", "CABA")]), {
    resultado: "adoptar",
    nueva: { tipo_matricula: "MN", numero_matricula: "123456", provincia_matricula: null },
    jurisdiccion: "CABA",
    por: "jurisdiccion",
  });
  // MN con el número de la Nacional: coincide sin tocar nada.
  assert.deepEqual(cruzarMatricula(MN("123456"), [med("123456", "CABA")]), { resultado: "coincide" });
});

test("el número es suyo pero declaró mal MN/MP o la provincia → se corrige la jurisdicción, no se valida tal cual", () => {
  // Antes esto "coincidía" y quedaba congelado un MN que REFEPS no le da.
  assert.deepEqual(cruzarMatricula(MN("2222"), [med("111111", "CABA"), med("2222", "Chaco")]), {
    resultado: "adoptar",
    nueva: { tipo_matricula: "MP", numero_matricula: "2222", provincia_matricula: "Chaco" },
    jurisdiccion: "Chaco",
    por: "jurisdiccion",
  });
  // El mismo número en dos jurisdicciones, ninguna la declarada: no se elige solo.
  assert.deepEqual(cruzarMatricula(MN("2222"), [med("2222", "Chaco"), med("2222", "Salta")]), {
    resultado: "revisar",
    motivo: "numero_en_varias_jurisdicciones",
    jurisdiccion: "CABA",
  });
});

test("EL CASO: un dígito mal tipeado → se adopta la única de médico habilitada de esa jurisdicción", () => {
  assert.deepEqual(cruzarMatricula(MN("128456"), [med("123456", "CABA")]), {
    resultado: "adoptar",
    nueva: { tipo_matricula: "MN", numero_matricula: "123456", provincia_matricula: null },
    jurisdiccion: "CABA",
    por: "numero",
  });
  // Con otra matrícula en otra provincia, se adopta la de la jurisdicción declarada.
  assert.deepEqual(cruzarMatricula(MN("654821"), [med("654321", "CABA"), med("4321", "Chaco")]), {
    resultado: "adoptar",
    nueva: { tipo_matricula: "MN", numero_matricula: "654321", provincia_matricula: null },
    jurisdiccion: "CABA",
    por: "numero",
  });
});

test("formato distinto (letra y cero adelante) → se adopta, y queda escrito como lo tiene REFEPS", () => {
  assert.deepEqual(cruzarMatricula(MP("1234", "Misiones"), [med("M01234", "Misiones")]), {
    resultado: "adoptar",
    nueva: { tipo_matricula: "MP", numero_matricula: "M01234", provincia_matricula: "Misiones" },
    jurisdiccion: "Misiones",
    por: "numero",
  });
});

test("mismos dígitos con distinta letra son DOS matrículas: no coincide y entre dos no se elige", () => {
  const refeps = [med("M1234", "Misiones"), med("K1234", "Misiones")];
  assert.deepEqual(cruzarMatricula(MP("K1234", "Misiones"), refeps), { resultado: "coincide" });
  assert.deepEqual(cruzarMatricula(MP("9999", "Misiones"), refeps), {
    resultado: "revisar",
    motivo: "varias_en_jurisdiccion",
    jurisdiccion: "Misiones",
  });
});

test("la misma matrícula repetida en REFEPS cuenta una vez", () => {
  assert.equal(cruzarMatricula(MN("128456"), [med("123456", "CABA"), med("123456", "CABA")]).resultado, "adoptar");
});

test("una matrícula de OTRA profesión nunca coincide ni se adopta, aunque el número sea el escrito", () => {
  const tecnico = { numero: "5555", tipo: "CABA", habilitada: true, profesion: "Técnico en hemoterapia" };
  assert.deepEqual(cruzarMatricula(MN("5555"), [tecnico]), {
    resultado: "revisar",
    motivo: "sin_matricula_de_medico",
    jurisdiccion: "CABA",
  });
  // Médico + otra profesión en la misma jurisdicción: se adopta la de médico.
  assert.deepEqual(cruzarMatricula(MN("5555"), [tecnico, med("123456", "CABA")]), {
    resultado: "adoptar",
    nueva: { tipo_matricula: "MN", numero_matricula: "123456", provincia_matricula: null },
    jurisdiccion: "CABA",
    por: "numero",
  });
  // Sin dato de profesión no se adivina.
  assert.equal(cruzarMatricula(MN("123456"), [{ numero: "123456", tipo: "CABA", habilitada: true }]).resultado, "revisar");
});

test("una matrícula NO habilitada nunca coincide ni se adopta", () => {
  assert.deepEqual(cruzarMatricula(MN("300"), [med("300", "CABA", false)]), {
    resultado: "revisar",
    motivo: "no_habilitada",
    jurisdiccion: "CABA",
  });
  // Una habilitada y una no: se adopta la habilitada.
  assert.deepEqual(cruzarMatricula(MN("300"), [med("300", "CABA", false), med("200", "CABA")]), {
    resultado: "adoptar",
    nueva: { tipo_matricula: "MN", numero_matricula: "200", provincia_matricula: null },
    jurisdiccion: "CABA",
    por: "numero",
  });
});

test("declaró una jurisdicción que REFEPS no tiene para ese DNI → revisar", () => {
  assert.deepEqual(cruzarMatricula(MP("M09999", "Misiones"), [med("111222", "CABA")]), {
    resultado: "revisar",
    motivo: "jurisdiccion_no_figura",
    jurisdiccion: "Misiones",
  });
  // Una jurisdicción que REFEPS manda como "Nacional" (sin provincia) no se toma por CABA.
  assert.equal(cruzarMatricula(MN("128456"), [med("123456", "Nacional")]).resultado, "revisar");
});

test("MP sin provincia y el número no figura → revisar; sin número o sin REFEPS → revisar", () => {
  assert.deepEqual(cruzarMatricula(MP("300", null), [med("100", "Salta")]), {
    resultado: "revisar",
    motivo: "jurisdiccion_declarada_desconocida",
    jurisdiccion: null,
  });
  assert.equal(cruzarMatricula(MN(""), [{ ...med("", "CABA") }]).resultado, "revisar");
  assert.equal(cruzarMatricula(MN("123"), []).resultado, "revisar");
  assert.equal(cruzarMatricula(MN("123"), null).resultado, "revisar");
});

test("de REFEPS a la ficha: CABA es MN sin provincia; las demás, MP + provincia; lo que no se reconoce, nada", () => {
  assert.deepEqual(declaradaDesdeRefeps(med(" 123456 ", "CABA")), { tipo_matricula: "MN", numero_matricula: "123456", provincia_matricula: null });
  assert.deepEqual(declaradaDesdeRefeps(med("M01234", "Misiones")), { tipo_matricula: "MP", numero_matricula: "M01234", provincia_matricula: "Misiones" });
  assert.equal(declaradaDesdeRefeps(med("123", "Provincial")), null);
  assert.equal(declaradaDesdeRefeps(med("", "CABA")), null);
});

test("esLaDeLaFicha: mismo tipo, número y jurisdicción", () => {
  assert.equal(esLaDeLaFicha(MN("123456"), med("123456", "CABA")), true);
  assert.equal(esLaDeLaFicha(MN("123456"), med("123456", "Chaco")), false);
  assert.equal(esLaDeLaFicha(MP("M01234", "Misiones"), med("M01234", "Misiones")), true);
  assert.equal(esLaDeLaFicha(MP("1234", "Misiones"), med("M01234", "Misiones")), false);
});

test("profesión: solo la de médico; sin dato no es de médico ni de otra profesión", () => {
  assert.equal(esMatriculaDeMedico({ profesion: "Médico" }), true);
  assert.equal(esMatriculaDeMedico({ profesion: "MEDICA" }), true);
  assert.equal(esMatriculaDeMedico({ profesion: "Técnico en hemoterapia" }), false);
  assert.equal(esMatriculaDeMedico({}), false);
  assert.equal(esDeOtraProfesion({ profesion: "Técnico en hemoterapia" }), true);
  assert.equal(esDeOtraProfesion({ profesion: "Médico" }), false);
  assert.equal(esDeOtraProfesion({}), false);
});

test("jurisdicciones de ejercicio: una matrícula de otra profesión no habilita; sin dato de profesión, como antes", () => {
  const { jurisdicciones } = derivarJurisdicciones([
    med("1", "CABA"),
    { tipo: "Chaco", habilitada: true, profesion: "Técnico en hemoterapia" },
    { tipo: "Salta", habilitada: true },
  ]);
  assert.deepEqual(jurisdicciones.sort(), ["CABA", "Salta"]);
});

test("etiquetas y motivos para pantalla", () => {
  assert.equal(etiquetaMatricula({ tipo_matricula: "MN", numero_matricula: "123456", provincia_matricula: null }), "MN 123456");
  assert.equal(etiquetaMatricula({ tipo_matricula: "MP", numero_matricula: "1234", provincia_matricula: "Salta" }), "MP 1234 (Salta)");
  assert.match(motivoRevisionHumano("jurisdiccion_no_figura", "CABA"), /Matrícula Nacional/);
  assert.match(motivoRevisionHumano("jurisdiccion_no_figura", "Misiones"), /matrícula de Misiones/);
});

test("el slug sigue a la matrícula corregida; lo que no reconoce no lo toca", () => {
  const vieja = { tipo: "MN", numero: "128456" };
  assert.equal(slugConMatricula("ana-perez-MN128456", vieja, { tipo: "MN", numero: "123456" }), "ana-perez-MN123456");
  assert.equal(slugConMatricula("ana-perez-MN128456", vieja, { tipo: "MP", numero: "M01234" }), "ana-perez-MPM01234");
  assert.equal(slugConMatricula("ana-perez-MN128456", vieja, { tipo: "MP", numero: "12 34/5" }), "ana-perez-MP12345");
  assert.equal(slugConMatricula("ana-perez-otra-cosa", vieja, { tipo: "MN", numero: "123456" }), null);
  assert.equal(slugConMatricula(null, vieja, { tipo: "MN", numero: "123456" }), null);
});

test("un timeout de REFEPS no borra las matrículas que ya estaban guardadas", () => {
  const previo = { encontrado: true, activo: true, matriculas: [med("123456", "CABA")] };
  const intento = { encontrado: false, error: "REFEPS_TIMEOUT" };
  const r = diagnosticoSinPisar(previo, intento, "2026-10-01T12:00:00Z");
  assert.deepEqual(r.matriculas, previo.matriculas);
  assert.equal(r.ultimo_error, "REFEPS_TIMEOUT");
  // Sin respuesta previa útil, se guarda el intento como antes.
  assert.deepEqual(diagnosticoSinPisar(null, intento, "x"), intento);
  assert.deepEqual(diagnosticoSinPisar({ error: "REFEPS_TIMEOUT" }, intento, "x"), intento);
});
