// QUÉ ES RUIDO EN LA BANDEJA — runner: node:test + node:assert con tsx.
// Ejecutar:  npm run test:unit
//
// Lo que importa cuidar: que un mail de una PERSONA REAL nunca caiga en "Otros",
// y que el ruido conocido sí.

import { test } from "node:test";
import assert from "node:assert/strict";
import { esRuidoBandeja, direccionDeCorreo } from "@/lib/bandeja/ruido";

test("una persona real NO es ruido", () => {
  for (const de of [
    "juan@gmail.com",
    "Ana Pérez <ana@hotmail.com>",
    "medico@hospitalitaliano.org.ar",
    "alumno@campus.fmed.uba.ar",
    "Guillermina <guillus_06@hotmail.com>",
  ]) {
    assert.equal(esRuidoBandeja({ de, sistema: false }), false, de);
  }
});

test("LinkedIn es ruido, en cualquier subdominio", () => {
  for (const de of [
    "notifications@linkedin.com",
    "jobs-listings@linkedin.com",
    "Grupo <messages-noreply@em.linkedin.com>",
    "invitations@e.linkedin.com",
  ]) {
    assert.equal(esRuidoBandeja({ de, sistema: false }), true, de);
  }
});

test("cargaconsorcios es ruido", () => {
  assert.equal(esRuidoBandeja({ de: "no-reply@cargaconsorcios.com.ar" }), true);
  assert.equal(esRuidoBandeja({ de: "Aviso <alertas@cargaconsorcios.com.ar>" }), true);
});

test("las cuentas de prueba son ruido", () => {
  for (const de of ["medico.test@docto.com.ar", "paciente.test1@docto.com.ar", "paciente.test10@docto.com.ar"]) {
    assert.equal(esRuidoBandeja({ de }), true, de);
  }
});

test("un @docto.com.ar que NO es cuenta de prueba no se marca por dominio", () => {
  // No queremos barrer todo el dominio propio: solo el patrón de las cuentas test.
  assert.equal(esRuidoBandeja({ de: "diego@docto.com.ar", sistema: false }), false);
});

test("los automáticos (sistema) son ruido aunque el dominio sea desconocido", () => {
  assert.equal(esRuidoBandeja({ de: "codigo@instagram.com", sistema: true }), true);
});

test("un dominio parecido pero distinto NO se cuela (evita el falso positivo por substring)", () => {
  assert.equal(esRuidoBandeja({ de: "hola@notlinkedin.com" }), false);
  assert.equal(esRuidoBandeja({ de: "hola@linkedin.com.evil.com" }), false);
});

test("de vacío o inválido no explota ni marca ruido", () => {
  assert.equal(esRuidoBandeja({ de: "" }), false);
  assert.equal(esRuidoBandeja({ de: "sin arroba" }), false);
  assert.equal(direccionDeCorreo("Nombre <a@b.com>"), "a@b.com");
  assert.equal(direccionDeCorreo("a@b.com"), "a@b.com");
});
