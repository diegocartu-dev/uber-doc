// Lo que Didit no aprueba solo se hace de nuevo; lo que frena Docto, no.
import { test } from "node:test";
import assert from "node:assert/strict";
import { esSesionVigente, pasoIdentidad, pasoIdentidadDeFicha } from "./estado-identidad";

const paso = (diditStatus: string | null, revisionDeDocto = false, habilitada = false) =>
  pasoIdentidad({ habilitada, diditStatus, revisionDeDocto });

test("validada o exenta: no le toca nada, diga lo que diga Didit", () => {
  for (const s of [null, "Declined", "In Review", "Kyc Expired", "Approved"]) assert.equal(paso(s, false, true), "habilitada");
});

test("lo que Didit no aprueba solo se repite: rechazo, revisión y pedido de repetir un paso", () => {
  for (const s of ["Declined", "In Review", "Resubmitted"]) assert.equal(paso(s), "repetir");
});

test("la revisión que puso Docto (identidad aprobada, cruce sin cerrar) no se repite", () => {
  assert.equal(paso("In Review", true), "cruce_en_revision");
  assert.equal(paso("Resubmitted", true), "cruce_en_revision");
  // Un rechazo real de Didit manda aunque haya quedado un motivo viejo.
  assert.equal(paso("Declined", true), "repetir");
});

test("empezó y no terminó: la retoma", () => {
  for (const s of ["In Progress", "Abandoned", "Expired"]) assert.equal(paso(s), "a_medias");
});

test("sin sesión o con un estado que no conocemos: arranca de cero", () => {
  for (const s of [null, "", "Not Started", "Kyc Expired", "Algo Nuevo"]) assert.equal(paso(s), "sin_empezar");
});

test("aprobada por Didit y todavía sin validar: falta el cruce de Docto", () => {
  assert.equal(paso("Approved"), "procesando");
});

test("desde la ficha: el motivo de revisión es lo que distingue la revisión de Docto", () => {
  assert.equal(pasoIdentidadDeFicha({ didit_status: "In Review", identidad_revision_motivo: null }), "repetir");
  assert.equal(pasoIdentidadDeFicha({ didit_status: "In Review", identidad_revision_motivo: "El DNI no coincide" }), "cruce_en_revision");
  assert.equal(pasoIdentidadDeFicha({ didit_status: "In Review", biometria_exenta: true }), "habilitada");
  assert.equal(pasoIdentidadDeFicha({}), "sin_empezar");
});

test("solo cuenta el aviso de la verificación vigente; sin sesión guardada no se descarta nada", () => {
  assert.equal(esSesionVigente("sesion-nueva", "sesion-nueva"), true);
  assert.equal(esSesionVigente("sesion-nueva", "sesion-vieja"), false);
  assert.equal(esSesionVigente(null, "cualquiera"), true);
  assert.equal(esSesionVigente("", "cualquiera"), true);
});
