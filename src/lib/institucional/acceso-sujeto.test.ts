// Tests del ACCESO POR SUJETO (migración 026) — el enlace que también sirve
// para el profesional invitado.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// ── QUÉ SE FIJA ACÁ ──────────────────────────────────────────────────────────
// Que extender `accesos_link` no haya AFLOJADO la puerta que la Etapa 3
// auditó. La forma vieja ("un paciente, exactamente un encuentro") es la que
// sostiene el scoping del token: un enlace sirve para SU turno y para ningún
// otro. La forma nueva agrega dos casos, y los dos tienen que quedar acotados:
//
//   · el profesional NUNCA lleva encuentro;
//   · el paciente SIN encuentro solo existe si la fila es de demostración.
//
// Las validaciones de `crearAccesoLink` se pueden probar de verdad porque
// ocurren ANTES de tocar la base: con el modo institucional apagado, una
// combinación inválida devuelve null sin abrir una sola conexión.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crearAccesoLink } from "@/lib/institucional/accesos";

const SQL_026 = readFileSync(
  join(process.cwd(), "supabase/migrations-institucional/026_acceso_sujeto.sql"),
  "utf8"
);

const PACIENTE = "00000000-0000-0000-0000-0000000000a1";
const MEDICO = "00000000-0000-0000-0000-0000000000b2";
const TURNO = "00000000-0000-0000-0000-0000000000c3";
const CONSULTA = "00000000-0000-0000-0000-0000000000d4";

beforeEach(() => {
  delete process.env.INSTITUCIONAL;
});

// ─────────────────────────────────────────────────────────────────────────────
// Las combinaciones que NO pueden acuñar un token
// ─────────────────────────────────────────────────────────────────────────────

test("sin sujeto no hay token", async () => {
  const res = await crearAccesoLink({
    destino: "/dashboard",
    operadorId: null,
    canal: null,
    enviadoA: null,
  });
  assert.equal(res, null);
});

test("con los dos sujetos tampoco: a quién se le mintearía la sesión sería ambiguo", async () => {
  const res = await crearAccesoLink({
    pacienteId: PACIENTE,
    medicoId: MEDICO,
    turnoId: TURNO,
    destino: "/x",
    operadorId: null,
    canal: null,
    enviadoA: null,
  });
  assert.equal(res, null);
});

test("el acceso del profesional NUNCA lleva encuentro", async () => {
  for (const recurso of [{ turnoId: TURNO }, { consultaId: CONSULTA }]) {
    const res = await crearAccesoLink({
      medicoId: MEDICO,
      ...recurso,
      destino: "/dashboard",
      operadorId: null,
      canal: null,
      enviadoA: null,
      esDemo: true,
    });
    assert.equal(res, null, JSON.stringify(recurso));
  }
});

test("un paciente sin encuentro solo pasa si el acceso es de demostración", async () => {
  // Sin `esDemo`, la regla de siempre: turno XOR consulta.
  const sinDemo = await crearAccesoLink({
    pacienteId: PACIENTE,
    destino: "/x",
    operadorId: null,
    canal: null,
    enviadoA: null,
  });
  assert.equal(sinDemo, null);

  // Y los dos recursos a la vez sigue siendo inválido, con demo o sin demo.
  const losDos = await crearAccesoLink({
    pacienteId: PACIENTE,
    turnoId: TURNO,
    consultaId: CONSULTA,
    destino: "/x",
    operadorId: null,
    canal: null,
    enviadoA: null,
  });
  assert.equal(losDos, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// La migración 026
// ─────────────────────────────────────────────────────────────────────────────

test("026 · exactamente un sujeto, garantizado por la base", () => {
  assert.match(SQL_026, /CONSTRAINT accesos_link_un_sujeto/);
  assert.match(SQL_026, /CHECK \(\(paciente_id IS NULL\) <> \(medico_id IS NULL\)\)/);
});

test("026 · la operación real sigue exigiendo exactamente un encuentro", () => {
  // Es LA propiedad que no se puede perder: fuera de la demo, un enlace vale
  // para su turno y para ningún otro.
  assert.match(SQL_026, /CONSTRAINT accesos_link_recurso_coherente/);
  assert.match(
    SQL_026,
    /\(paciente_id IS NOT NULL AND \(\(turno_id IS NULL\) <> \(consulta_id IS NULL\)\)\)/
  );
  // El caso sin recurso está condicionado a es_demo, no suelto.
  assert.match(
    SQL_026,
    /\(paciente_id IS NOT NULL AND es_demo AND turno_id IS NULL AND consulta_id IS NULL\)/
  );
  // Y el profesional, sin encuentro siempre.
  assert.match(
    SQL_026,
    /\(medico_id IS NOT NULL AND turno_id IS NULL AND consulta_id IS NULL\)/
  );
});

test("026 · el CHECK viejo se reemplaza, no convive con el nuevo", () => {
  // Dos CHECKs sobre lo mismo con intersección vacía = ningún INSERT pasa, y el
  // fallo aparece recién en la reunión. Por eso hay pre-check que aborta.
  assert.match(SQL_026, /RAISE EXCEPTION 'No existe el CHECK/);
  assert.match(SQL_026, /DROP CONSTRAINT IF EXISTS accesos_link_un_recurso/);
});

test("026 · el enlace de la demo tiene su propio origen", () => {
  // La 012 puso un backstop: sin operador, el origen no puede ser 'asignacion'.
  // El enlace de la reunión lo emite un admin de Docto, que no es operador.
  assert.match(SQL_026, /origen IN \('asignacion', 'reenvio_paciente', 'reprogramacion', 'demo'\)/);
});

test("026 · es reentrante: volver a aplicarla no rompe nada", () => {
  assert.match(SQL_026, /ADD COLUMN IF NOT EXISTS medico_id/);
  assert.match(SQL_026, /ADD COLUMN IF NOT EXISTS es_demo/);
  assert.match(SQL_026, /CREATE INDEX IF NOT EXISTS idx_accesos_link_medico/);
  // Los constraints se agregan solo si no estaban.
  const guardas = SQL_026.match(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = '/g) ?? [];
  assert.ok(guardas.length >= 2, "los constraints nuevos se agregan con guarda");
});
