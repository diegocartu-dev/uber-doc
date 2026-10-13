// La constancia sale con el texto que aprobó Diego (13/10/2026) y nada clínico.
// Datos sintéticos. Ejecutar:  npx tsx --test src/lib/documentos/constancia.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { textoConstancia, matriculaConJurisdiccion } from "./constancia";

const base = {
  pacienteNombre: "Ana Prueba",
  pacienteDni: "30111222",
  fecha: "2026-10-20",
  hora: "18:30:00",
  profesionalNombre: "Laura Ejemplo",
  matriculaTipo: "MP",
  matriculaNumero: "5555",
  matriculaProvincia: "Córdoba",
  domicilio: "Av. Siempreviva 742, Córdoba",
};

test("el texto aprobado, completo", () => {
  assert.equal(
    textoConstancia(base),
    [
      "Dejo constancia de que Ana Prueba, DNI 30111222, asistió a una sesión de atención psicológica por videollamada el 20/10/2026 a las 18:30 hs.",
      "",
      "Lic. Laura Ejemplo",
      "Licenciado/a en Psicología",
      "Matrícula MP 5555 — Córdoba",
      "Domicilio profesional: Av. Siempreviva 742, Córdoba",
      "",
      "Firmado electrónicamente en Docto.",
    ].join("\n")
  );
});

test("matrícula: la provincial con su provincia; la nacional dice Nacional", () => {
  assert.equal(matriculaConJurisdiccion("MP", "5555", "Salta"), "MP 5555 — Salta");
  assert.equal(matriculaConJurisdiccion("MN", "12345", null), "MN 12345 — Nacional");
  assert.equal(matriculaConJurisdiccion("MP", "5555", null), "MP 5555");
});

test("nada clínico: no menciona diagnóstico ni motivo", () => {
  assert.doesNotMatch(textoConstancia(base), /diagn|motivo|tratamiento/i);
});
