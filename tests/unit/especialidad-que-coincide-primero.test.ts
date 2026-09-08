// Decisión Diego 07/09/2026: cuando el paciente busca una especialidad y el
// profesional la tiene como ADICIONAL, se muestra primero la que coincide —
// no la principal. Caso real: "Cirugía plástica · Clínica médica" ante quien
// buscó clínica, y el paciente pasaba de largo.
import assert from "node:assert/strict";
import { test } from "node:test";
import { especialidadesEnOrdenDeBusqueda } from "../../src/app/clinica/disponibilidad";

const medica = {
  id: "m", especialidad: "Cirugía plástica y reparadora", especialidadesAdicionales: ["Clínica médica"],
  modalidad_atencion: null, nombre_completo: "X", titulo: null, disponible: true, disponible_desde: null,
  disponible_hasta: null, disponible_desde_at: null, precio_consulta: 20000, duracion_consulta: 30,
  foto_url: null, habilitadoIdentidad: true, ciBloqueadaPorTurno: false, jurisdicciones: ["CABA"],
} as Parameters<typeof especialidadesEnOrdenDeBusqueda>[0];

test("buscando 'clinica', la adicional que coincide va primero", () => {
  assert.deepEqual(especialidadesEnOrdenDeBusqueda(medica, "clinica"), ["Clínica médica", "Cirugía plástica y reparadora"]);
  assert.deepEqual(especialidadesEnOrdenDeBusqueda(medica, "Clínica Médica"), ["Clínica médica", "Cirugía plástica y reparadora"], "acentos y mayúsculas no importan");
});

test("sin búsqueda, o buscando por nombre, queda el orden declarado", () => {
  assert.deepEqual(especialidadesEnOrdenDeBusqueda(medica, ""), ["Cirugía plástica y reparadora", "Clínica médica"]);
  assert.deepEqual(especialidadesEnOrdenDeBusqueda(medica, "natalia"), ["Cirugía plástica y reparadora", "Clínica médica"]);
});

test("si coincide la principal, no cambia nada; sin adicionales, tampoco", () => {
  assert.deepEqual(especialidadesEnOrdenDeBusqueda(medica, "cirug"), ["Cirugía plástica y reparadora", "Clínica médica"]);
  assert.deepEqual(especialidadesEnOrdenDeBusqueda({ ...medica, especialidadesAdicionales: [] }, "clinica"), ["Cirugía plástica y reparadora"]);
});
