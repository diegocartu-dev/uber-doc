// El puente entre la config de la institución y el papel que sale impreso.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { accentEfectivo } from "@/lib/institucional/branding-pdf";
import { accentDe } from "@/lib/pdf/receta";

// ─────────────────────────────────────────────────────────────────────────────
// EL ACENTO DEL DOCUMENTO — sin `pdf_accent`, manda el primario de la
// institución. NUNCA el azul de Docto.
// ─────────────────────────────────────────────────────────────────────────────

test("sin pdf_accent, el acento del documento es el primario de la institución", () => {
  assert.equal(accentEfectivo({ pdf_accent: null, color_primary: "#4A3F8C" }), "#4A3F8C");
  assert.equal(accentEfectivo({ pdf_accent: "", color_primary: "#4A3F8C" }), "#4A3F8C");
  assert.equal(accentEfectivo({ pdf_accent: "   ", color_primary: "#4A3F8C" }), "#4A3F8C");
});

test("con pdf_accent, manda pdf_accent (el color del chrome puede no servir impreso)", () => {
  assert.equal(accentEfectivo({ pdf_accent: "#7A3E9D", color_primary: "#4A3F8C" }), "#7A3E9D");
});

test("el acento efectivo llega entero al generador: el papel del ministerio NO sale azul Docto", () => {
  // Es la cadena completa del hallazgo: config sin pdf_accent → branding →
  // accentDe(). Antes daba #378ADD, el azul de marca de Docto, en los labels
  // PROFESIONAL / PACIENTE / DIAGNÓSTICO, la línea del header y los "1. Rp/".
  const accent = accentEfectivo({ pdf_accent: null, color_primary: "#4A3F8C" });
  assert.equal(accentDe({ nombre: "X", efectorTexto: "", accent }), "#4A3F8C");
  assert.notEqual(accentDe({ nombre: "X", efectorTexto: "", accent }), "#378ADD");
});
