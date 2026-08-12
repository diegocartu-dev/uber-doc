// Tests del resolver de roles institucionales — runner: node:test + node:assert,
// corridos con tsx.  Ejecutar:  npx tsx --test src/lib/auth/rol-institucional.test.ts
//
// Lo que se fija acá es la REGLA DE ORO del modo institucional:
//   1. Con INSTITUCIONAL apagado (B2C) los roles de operador NUNCA se resuelven
//      — y además el resolver NO consulta la DB (la tabla no existe en B2C).
//   2. Con INSTITUCIONAL=true se resuelven desde `operadores` con precedencia
//      admin_institucion > otorgador.
//
// El lookup de DB se inyecta (parámetro `buscar`) para testear sin Supabase.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolverRolInstitucional,
  resolverOperador,
  elegirOperador,
  rutaOperador,
  type OperadorActivo,
} from "./rol-institucional";

const USER = "00000000-0000-0000-0000-000000000001";

function op(parcial: Partial<OperadorActivo>): OperadorActivo {
  return { id: "op-1", nombre: "Claudia Romero", tipo: "humano", nivel: "otorgador", ...parcial };
}

beforeEach(() => {
  delete process.env.INSTITUCIONAL;
});

// ─── Flag APAGADO (B2C) ──────────────────────────────────────────────────────

test("flag apagado: devuelve null aunque exista fila de operador", async () => {
  const rol = await resolverRolInstitucional(USER, async () => [op({})]);
  assert.equal(rol, null);
});

test("flag apagado: NO toca la DB (el gate va primero)", async () => {
  let llamadas = 0;
  await resolverRolInstitucional(USER, async () => {
    llamadas++;
    return [op({})];
  });
  assert.equal(llamadas, 0);
});

test("flag con cualquier valor distinto de 'true' sigue siendo B2C", async () => {
  for (const valor of ["", "false", "TRUE", "1", "yes"]) {
    process.env.INSTITUCIONAL = valor;
    const rol = await resolverRolInstitucional(USER, async () => [op({})]);
    assert.equal(rol, null, `INSTITUCIONAL=${JSON.stringify(valor)} no debe activar el modo`);
  }
});

// ─── Flag PRENDIDO (instancia institucional) ─────────────────────────────────

test("flag prendido: otorgador se resuelve desde operadores", async () => {
  process.env.INSTITUCIONAL = "true";
  const rol = await resolverRolInstitucional(USER, async () => [op({ nivel: "otorgador" })]);
  assert.equal(rol, "otorgador");
});

test("flag prendido: admin_institucion se resuelve desde operadores", async () => {
  process.env.INSTITUCIONAL = "true";
  const rol = await resolverRolInstitucional(USER, async () => [op({ nivel: "admin_institucion" })]);
  assert.equal(rol, "admin_institucion");
});

test("flag prendido: sin fila de operador → null (usuario no es operador)", async () => {
  process.env.INSTITUCIONAL = "true";
  const rol = await resolverRolInstitucional(USER, async () => []);
  assert.equal(rol, null);
});

test("flag prendido: userId vacío → null sin consultar", async () => {
  process.env.INSTITUCIONAL = "true";
  let llamadas = 0;
  const rol = await resolverRolInstitucional(null, async () => {
    llamadas++;
    return [op({})];
  });
  assert.equal(rol, null);
  assert.equal(llamadas, 0);
});

test("flag prendido: resolverOperador devuelve la fila entera (para auditoría)", async () => {
  process.env.INSTITUCIONAL = "true";
  const fila = op({ id: "op-9", nombre: "Gabriela Sosa", nivel: "admin_institucion" });
  const operador = await resolverOperador(USER, async () => [fila]);
  assert.deepEqual(operador, fila);
});

// ─── Precedencia con múltiples filas ─────────────────────────────────────────

test("dos filas activas: admin_institucion le gana a otorgador (en cualquier orden)", () => {
  const otorg = op({ id: "a", nivel: "otorgador" });
  const admin = op({ id: "b", nivel: "admin_institucion" });
  assert.equal(elegirOperador([otorg, admin])?.id, "b");
  assert.equal(elegirOperador([admin, otorg])?.id, "b");
});

test("lista vacía → null", () => {
  assert.equal(elegirOperador([]), null);
});

// ─── Rutas post-login ────────────────────────────────────────────────────────

test("rutas home por rol de operador", () => {
  assert.equal(rutaOperador("otorgador"), "/otorgador");
  assert.equal(rutaOperador("admin_institucion"), "/panel");
});
