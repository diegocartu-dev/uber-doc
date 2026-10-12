// EL BUZÓN DE SARA — runner: node:test + node:assert con tsx.
// Ejecutar:  npm run test:unit
//
// Lo que importa cuidar: que sin la aceptación de la persona no entre nada, que
// lo que no está en el contrato no se guarde, y que Sara reciba un error que le
// sirva para volver a preguntar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { validarContactoSara, asuntoSara, cuerpoSara, TOPE_INTERES } from "@/lib/bandeja/sara";

const AHORA = new Date("2026-10-12T15:00:00.000Z");

const institucion = {
  tipo: "institucion",
  nombre: "Juan Ejemplo",
  institucion: "Clínica Ejemplo",
  mail: "Juan@Ejemplo.test",
  telefono: "11 5555-0000",
  interes: "Quieren Docto para sus pacientes",
  acepta_contacto: true,
  recibido: "2026-10-12T14:59:00.000Z",
};

test("una institución completa entra, con el mail en minúsculas", () => {
  const r = validarContactoSara(institucion, AHORA);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.contacto.tipo, "institucion");
  assert.equal(r.contacto.mail, "juan@ejemplo.test");
  assert.equal(r.contacto.telefono, "11 5555-0000");
  assert.equal(r.contacto.recibido, "2026-10-12T14:59:00.000Z");
  assert.equal(r.idExterno, null);
});

test("sin la aceptación de la persona no entra nada", () => {
  for (const acepta of [false, undefined, "true", 1, "si"]) {
    const r = validarContactoSara({ ...institucion, acepta_contacto: acepta }, AHORA);
    assert.equal(r.ok, false, String(acepta));
    if (!r.ok) assert.match(r.error, /acepte ser contactada/);
  }
});

test("el tipo tiene que ser uno de los dos: no se adivina", () => {
  for (const tipo of [undefined, "paciente", "Institucion", ""]) {
    assert.equal(validarContactoSara({ ...institucion, tipo }, AHORA).ok, false, String(tipo));
  }
});

test("una institución sin nombre de institución no entra; un profesional sin profesión tampoco", () => {
  assert.equal(validarContactoSara({ ...institucion, institucion: "  " }, AHORA).ok, false);
  const profesional = { ...institucion, tipo: "profesional", institucion: undefined, profesion: "" };
  assert.equal(validarContactoSara(profesional, AHORA).ok, false);
  const r = validarContactoSara({ ...profesional, profesion: "Psicóloga clínica" }, AHORA);
  assert.equal(r.ok, true);
});

test("mail y teléfono: los mismos criterios que el buzón de la demo", () => {
  const sinMail = validarContactoSara({ ...institucion, mail: "juan arroba ejemplo" }, AHORA);
  assert.equal(sinMail.ok, false);
  if (!sinMail.ok) assert.match(sinMail.error, /mail/);

  const telCorto = validarContactoSara({ ...institucion, telefono: "5555-00" }, AHORA);
  assert.equal(telCorto.ok, false);
  if (!telCorto.ok) assert.match(telCorto.error, /característica/);

  // Las letras se van; los separadores que ayudan a leerlo quedan.
  const r = validarContactoSara({ ...institucion, telefono: "+54 9 (11) 5555-0000 int. 2" }, AHORA);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.contacto.telefono, "+54 9 (11) 5555-0000 2");
});

test("lo que no está en el contrato no se guarda", () => {
  const r = validarContactoSara(
    { ...institucion, motivo_consulta: "dolor de pecho", dni: "1", clave: "x" },
    AHORA,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const claves = Object.keys(r.contacto).sort();
  assert.deepEqual(claves, [
    "acepta_contacto", "institucion", "interes", "mail", "nombre", "profesion", "recibido", "telefono", "tipo",
  ]);
});

test("el interés tiene tope, y un recibido que no es fecha se reemplaza por la hora de llegada", () => {
  const r = validarContactoSara({ ...institucion, interes: "x".repeat(1000), recibido: "ayer" }, AHORA);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.contacto.interes.length, TOPE_INTERES);
  assert.equal(r.contacto.recibido, AHORA.toISOString());
});

test("el tope nunca parte un emoji: Postgres rechaza el JSON con medio carácter", () => {
  const sueltas = /[\ud800-\udfff]/;
  const enElTope = validarContactoSara({ ...institucion, interes: "x".repeat(TOPE_INTERES - 1) + "😀😀" }, AHORA);
  assert.equal(enElTope.ok, true);
  if (enElTope.ok) {
    assert.equal(enElTope.contacto.interes, "x".repeat(TOPE_INTERES - 1) + "😀");
    assert.equal(JSON.stringify(enElTope.contacto.interes).includes("\\ud83d"), false);
  }

  // Una mitad suelta que ya viene en el JSON de Sara se descarta.
  const suelta = validarContactoSara({ ...institucion, nombre: "Juan \ud83d Ejemplo" }, AHORA);
  assert.equal(suelta.ok, true);
  if (suelta.ok) {
    assert.equal(sueltas.test(suelta.contacto.nombre), false);
    assert.equal(suelta.contacto.nombre, "Juan Ejemplo");
    // Un emoji entero, en cambio, queda.
    const entero = validarContactoSara({ ...institucion, nombre: "Juan 🙂" }, AHORA);
    assert.equal(entero.ok && entero.contacto.nombre, "Juan 🙂");
  }
});

test("el id de Sara viaja aparte, para no duplicar si reintenta", () => {
  const r = validarContactoSara({ ...institucion, id_externo: "  sara-123  " }, AHORA);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.idExterno, "sara-123");
});

test("un cuerpo que no es un objeto no rompe: devuelve un error", () => {
  for (const cuerpo of [null, "hola", 3, [institucion]]) {
    assert.equal(validarContactoSara(cuerpo, AHORA).ok, false);
  }
});

test("asunto y texto se leen sin abrir la ficha", () => {
  const r = validarContactoSara(institucion, AHORA);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(asuntoSara(r.contacto), "Institución · Clínica Ejemplo");
  const texto = cuerpoSara(r.contacto);
  assert.match(texto, /Institución: Clínica Ejemplo/);
  assert.match(texto, /Aceptó ser contactado\/a: sí/);
  assert.doesNotMatch(texto, /Profesión/);
});
