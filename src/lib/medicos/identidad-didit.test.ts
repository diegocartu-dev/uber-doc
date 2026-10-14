// La identidad del profesional sale de Didit tal cual; lo que no trae, vacío.
// Ejecutar:  npx tsx --test src/lib/medicos/identidad-didit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { identidadDeDecision } from "./identidad-didit";
import type { DiditDecision } from "@/lib/didit/types";

const decision = (v: Record<string, unknown>) => ({ id_verifications: [v] }) as unknown as DiditDecision;

test("toma fecha, sexo, nombre y apellido del DNI", () => {
  assert.deepEqual(identidadDeDecision(decision({ date_of_birth: "1970-05-20", gender: "f", first_name: " Ana ", last_name: "Pérez" })), {
    fecha_nacimiento: "1970-05-20",
    sexo: "F",
    nombre: "Ana",
    apellido: "Pérez",
  });
});

test("lo que no viene o no tiene forma válida queda vacío: no se adivina", () => {
  assert.deepEqual(identidadDeDecision(decision({ date_of_birth: "20/05/1970", gender: "Femenino" })), {
    fecha_nacimiento: null,
    sexo: null,
    nombre: null,
    apellido: null,
  });
  assert.deepEqual(identidadDeDecision(null), { fecha_nacimiento: null, sexo: null, nombre: null, apellido: null });
  assert.deepEqual(identidadDeDecision({} as DiditDecision), { fecha_nacimiento: null, sexo: null, nombre: null, apellido: null });
});
