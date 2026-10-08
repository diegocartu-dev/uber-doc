// Clínica médica y Medicina general son la misma puerta para el paciente (Diego, 08/10/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mismaAtencion, buscaAtencionGeneral, esAtencionGeneral } from "./especialidades";
import { coincideConBusqueda } from "@/app/clinica/disponibilidad";

test("atención general: Clínica médica, Medicina general, Medicina general y familiar y Medicina familiar son la misma", () => {
  assert.equal(mismaAtencion("Clínica médica", "Medicina general"), true);
  assert.equal(mismaAtencion("Medicina general y familiar", "Clinica medica"), true);
  assert.equal(mismaAtencion("Geriatría", "Geriatria"), true);
  assert.equal(mismaAtencion("Medicina general", "Pediatría"), false);
  assert.equal(esAtencionGeneral("Medicina familiar"), true); // sumada por Diego el 08/10
  assert.equal(mismaAtencion("Medicina familiar", "Clínica médica"), true);
});

test("buscador: 'clínica' o 'generalista' encuentran a los dos", () => {
  assert.equal(buscaAtencionGeneral("clinica"), true);
  assert.equal(buscaAtencionGeneral("generalista"), true);
  assert.equal(buscaAtencionGeneral("pediatria"), false);
  const generalista = { especialidad: "Medicina general", especialidadesAdicionales: [], nombre_completo: "X", areasAtencion: [] } as never;
  const clinico = { especialidad: "Clínica médica", especialidadesAdicionales: [], nombre_completo: "Y", areasAtencion: [] } as never;
  assert.equal(coincideConBusqueda(generalista, "clínica"), true);
  assert.equal(coincideConBusqueda(clinico, "medicina general"), true);
  assert.equal(coincideConBusqueda(generalista, "pediatría"), false);
});
