// A quién se le escribe por su identidad mientras está en revisión, y cuándo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contarIntentos, decidirAvisoIdentidad, type FichaAviso } from "./aviso-identidad";

const AHORA = Date.parse("2026-11-16T15:00:00-03:00");
const hace = (horas: number) => new Date(AHORA - horas * 3600_000).toISOString();

const ficha = (cambios: Partial<FichaAviso> = {}): FichaAviso => ({
  estado_registro: "pendiente_revision",
  es_cuenta_test: false,
  dado_de_baja: false,
  created_at: hace(48),
  identidad_validada: false,
  biometria_exenta: false,
  didit_status: null,
  identidad_revision_motivo: null,
  identidad_recordatorio_at: null,
  ...cambios,
});

test("no empezó o no terminó: 'falta', recién al día siguiente del alta", () => {
  assert.equal(decidirAvisoIdentidad(ficha(), AHORA), "falta");
  assert.equal(decidirAvisoIdentidad(ficha({ didit_status: "In Progress" }), AHORA), "falta");
  assert.equal(decidirAvisoIdentidad(ficha({ didit_status: "Abandoned" }), AHORA), "falta");
  assert.equal(decidirAvisoIdentidad(ficha({ created_at: hace(5) }), AHORA), null);
});

test("Didit no la aprobó: 'repetir', sin esperar al día siguiente", () => {
  for (const s of ["In Review", "Declined", "Resubmitted"]) {
    assert.equal(decidirAvisoIdentidad(ficha({ didit_status: s, created_at: hace(1) }), AHORA), "repetir");
  }
});

test("al que espera algo de Docto no se le escribe: no puede hacer nada", () => {
  assert.equal(decidirAvisoIdentidad(ficha({ didit_status: "In Review", identidad_revision_motivo: "El DNI no coincide" }), AHORA), null);
  assert.equal(decidirAvisoIdentidad(ficha({ didit_status: "Approved" }), AHORA), null);
  assert.equal(decidirAvisoIdentidad(ficha({ identidad_validada: true }), AHORA), null);
  assert.equal(decidirAvisoIdentidad(ficha({ biometria_exenta: true }), AHORA), null);
});

test("un aviso cada 72 horas, y se deja de insistir a los 30 días del alta", () => {
  assert.equal(decidirAvisoIdentidad(ficha({ identidad_recordatorio_at: hace(10) }), AHORA), null);
  assert.equal(decidirAvisoIdentidad(ficha({ identidad_recordatorio_at: hace(73) }), AHORA), "falta");
  assert.equal(decidirAvisoIdentidad(ficha({ didit_status: "Declined", identidad_recordatorio_at: hace(10) }), AHORA), null);
  assert.equal(decidirAvisoIdentidad(ficha({ created_at: hace(31 * 24) }), AHORA), null);
});

test("solo fichas en revisión, reales y sin baja", () => {
  for (const estado of ["aprobado", "rechazado", "suspendido", null]) {
    assert.equal(decidirAvisoIdentidad(ficha({ estado_registro: estado }), AHORA), null);
  }
  assert.equal(decidirAvisoIdentidad(ficha({ es_cuenta_test: true }), AHORA), null);
  assert.equal(decidirAvisoIdentidad(ficha({ dado_de_baja: true }), AHORA), null);
  assert.equal(decidirAvisoIdentidad(ficha({ created_at: null }), AHORA), null);
});

test("los intentos se cuentan por verificación, no por aviso", () => {
  assert.deepEqual(contarIntentos([], "a"), { intentos: 1, yaRegistrado: false });
  assert.deepEqual(contarIntentos([{ metadata: { sesion: "a" } }], "a"), { intentos: 1, yaRegistrado: true });
  assert.deepEqual(contarIntentos([{ metadata: { sesion: "a" } }, { metadata: { sesion: "a" } }], "b"), { intentos: 2, yaRegistrado: false });
  assert.deepEqual(contarIntentos([{ metadata: null }, { metadata: { otra: 1 } }], "b"), { intentos: 1, yaRegistrado: false });
});
