// Tests del MODO DEMO — parte pura + invariantes de la migración 025.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// La migración se aplica A MANO en el SQL Editor (no hay CLI autenticado), así
// que lo que se puede verificar acá es su TEXTO: que las defensas estén
// escritas, que sea reentrante y —lo que más importa— que la tabla donde viven
// el nombre y el celular de personas reales no tenga ninguna puerta abierta
// hacia el navegador.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validarParticipante,
  emailDemo,
  nombreSesionPorDefecto,
} from "@/lib/institucional/demo";

const SQL_025 = readFileSync(
  join(process.cwd(), "supabase/migrations-institucional/025_demo_sesiones.sql"),
  "utf8"
);

// ─────────────────────────────────────────────────────────────────────────────
// La carga del participante
// ─────────────────────────────────────────────────────────────────────────────

test("lo único obligatorio es el nombre y el rol", () => {
  const res = validarParticipante({ nombre: "Nombre Apellido", rol: "profesional" });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.datos.celular, null);
    assert.equal(res.datos.rol, "profesional");
  }
});

test("sin celular el participante entra igual: el camino garantizado es el QR", () => {
  // Si esto pidiera celular, una demo sin WhatsApp aprobado se caería en la
  // sala por un dato que la entrega por QR no necesita.
  for (const celular of [undefined, null, "", "   "]) {
    const res = validarParticipante({ nombre: "Nombre Apellido", rol: "paciente", celular });
    assert.equal(res.ok, true, `celular=${JSON.stringify(celular)}`);
  }
});

test("un celular cargado se normaliza a E.164, y uno inválido no pasa", () => {
  const ok = validarParticipante({ nombre: "Nombre Apellido", rol: "paciente", celular: "11 2345-6789" });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.match(ok.datos.celular ?? "", /^\+549\d{10}$/);

  const mal = validarParticipante({ nombre: "Nombre Apellido", rol: "paciente", celular: "123" });
  assert.equal(mal.ok, false);
});

test("el rol tiene que ser uno de los dos", () => {
  const res = validarParticipante({ nombre: "Nombre Apellido", rol: "operador" });
  assert.equal(res.ok, false);
});

test("nombre demasiado corto: no entra", () => {
  assert.equal(validarParticipante({ nombre: "Ab", rol: "paciente" }).ok, false);
});

test("DNI y fecha de nacimiento son opcionales, pero si vienen se validan", () => {
  const sin = validarParticipante({ nombre: "Nombre Apellido", rol: "paciente" });
  assert.equal(sin.ok, true);
  if (sin.ok) {
    assert.equal(sin.datos.dni, null);
    assert.equal(sin.datos.fecha_nacimiento, null);
  }

  const conDniCorto = validarParticipante({ nombre: "Nombre Apellido", rol: "paciente", dni: "12" });
  assert.equal(conDniCorto.ok, false);

  const fechaFutura = validarParticipante({
    nombre: "Nombre Apellido",
    rol: "paciente",
    fecha_nacimiento: "2099-01-01",
  });
  assert.equal(fechaFutura.ok, false);

  const bien = validarParticipante({
    nombre: "Nombre Apellido",
    rol: "paciente",
    dni: "30.123.456",
    fecha_nacimiento: "1980-05-04",
  });
  assert.equal(bien.ok, true);
  if (bien.ok) assert.equal(bien.datos.dni, "30123456");
});

// ─────────────────────────────────────────────────────────────────────────────
// El alias de correo
// ─────────────────────────────────────────────────────────────────────────────

test("el alias de la demo es no entregable y NO lleva el nombre de la persona", () => {
  const mail = emailDemo("a1b2c3d4", "https://salud.gob.ar/algo");
  assert.equal(mail, "demo-a1b2c3d4@demo.salud.gob.ar");
  // El subdominio reservado no tiene MX: nada puede llegar ahí.
  assert.match(mail, /@demo\./);
});

test("el nombre por defecto de una reunión no lleva PII", () => {
  const nombre = nombreSesionPorDefecto(new Date("2026-08-21T15:00:00Z"));
  assert.match(nombre, /^Reunión \d{2}\/\d{2}$/);
});

// ─────────────────────────────────────────────────────────────────────────────
// La migración 025
// ─────────────────────────────────────────────────────────────────────────────

test("025 · los datos de los participantes NO son legibles desde el navegador", () => {
  // Es la defensa que importa: acá hay nombre y celular de personas reales.
  assert.match(SQL_025, /ALTER TABLE demo_sesiones\s+ENABLE ROW LEVEL SECURITY/);
  assert.match(SQL_025, /ALTER TABLE demo_participantes ENABLE ROW LEVEL SECURITY/);
  assert.match(SQL_025, /REVOKE ALL ON demo_sesiones\s+FROM anon, authenticated/);
  assert.match(SQL_025, /REVOKE ALL ON demo_participantes FROM anon, authenticated/);
  // Sin policies: ninguna puerta de lectura para PostgREST.
  assert.equal((SQL_025.match(/CREATE POLICY/g) ?? []).length, 0);
});

test("025 · todo cuelga de la reunión, así se puede limpiar de una", () => {
  assert.match(SQL_025, /sesion_id\s+uuid NOT NULL REFERENCES demo_sesiones\(id\) ON DELETE CASCADE/);
  assert.match(SQL_025, /ALTER TABLE medicos\s+ADD COLUMN IF NOT EXISTS demo_sesion_id/);
  assert.match(SQL_025, /ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS demo_sesion_id/);
});

test("025 · el encuentro y el papel quedan marcados, y la marca la pone un trigger", () => {
  for (const tabla of ["turnos", "consultas", "documentos"]) {
    assert.match(
      SQL_025,
      new RegExp(`ALTER TABLE ${tabla}\\s+ADD COLUMN IF NOT EXISTS es_demo boolean NOT NULL DEFAULT false`),
      `falta la marca en ${tabla}`
    );
    assert.match(
      SQL_025,
      new RegExp(`CREATE TRIGGER trg_${tabla}_es_demo`),
      `falta el trigger de ${tabla}`
    );
  }
});

test("025 · el trigger conoce la asimetría de paciente_id entre turnos y consultas", () => {
  // consultas.paciente_id = auth.users.id; turnos/documentos.paciente_id = pacientes.id.
  // Sin este branch, la CI de un paciente de demo entraría a la factura.
  assert.match(SQL_025, /IF TG_TABLE_NAME = 'consultas' THEN/);
  assert.match(SQL_025, /FROM pacientes p WHERE p\.user_id = NEW\.paciente_id/);
  assert.match(SQL_025, /FROM pacientes p WHERE p\.id = NEW\.paciente_id/);
});

test("025 · la marca de demo nunca se apaga sola en un UPDATE", () => {
  assert.match(SQL_025, /NEW\.es_demo := COALESCE\(OLD\.es_demo, false\) OR es/);
});

test("025 · es reentrante: volver a aplicarla no rompe nada", () => {
  // Se aplica a mano en el SQL Editor: un pegado que se corta a la mitad tiene
  // que poder repetirse entero.
  const tablas = SQL_025.match(/CREATE TABLE IF NOT EXISTS/g) ?? [];
  assert.equal(tablas.length, 2, "las dos tablas se crean con IF NOT EXISTS");
  const creados = SQL_025.match(/CREATE TRIGGER/g) ?? [];
  const dropeados = SQL_025.match(/DROP TRIGGER IF EXISTS/g) ?? [];
  assert.equal(dropeados.length, creados.length, "cada trigger se dropea antes de crearse");
  assert.equal((SQL_025.match(/CREATE INDEX(?! IF NOT EXISTS)/g) ?? []).length, 0);
  assert.match(SQL_025, /CREATE OR REPLACE FUNCTION marcar_fila_demo/);
  // El CHECK del rol se agrega solo si no existía.
  assert.match(SQL_025, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'demo_participantes_rol_coherente'\)/);
});

test("025 · ningún dato de una persona real quedó escrito en la migración", () => {
  // El repo es PÚBLICO. Un teléfono o un DNI de ejemplo acá sería un dato real
  // filtrado para siempre en el historial de git.
  assert.equal(/\+54\s?9?\s?\d{6,}/.test(SQL_025), false, "hay algo con pinta de teléfono");
  assert.equal(/\b\d{7,8}\b/.test(SQL_025.replace(/\b(025|004|002|008|326|506|553|802)\b/g, "")), false);
});
