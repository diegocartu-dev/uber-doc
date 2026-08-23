import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diferenciasIdentidadPaciente,
  mezclarIdentidadRectificada,
  type IdentidadDocumento,
} from "./identidad";

const medicoV2 = {
  medico_nombre: "Profesional De Prueba",
  medico_titulo: "Dra.",
  medico_especialidad: "Clínica médica",
  medico_matricula: "MN 000000",
  medico_domicilio: "Calle Falsa 123",
  medico_firma_manuscrita_path: "medicos/x/firma.png",
};

const pacienteIncompleto = {
  paciente_nombre: "Luciana",
  paciente_dni: "00000000",
  paciente_cuil: "27-00000000-0",
  paciente_sexo_dni: "femenino",
  paciente_fecha_nacimiento: "1990-01-01",
  paciente_tiene_cobertura: true,
  paciente_obra_social: "OS",
  paciente_nro_afiliado: "1",
  paciente_plan_obra_social: null,
};

const fichaCorregida: IdentidadDocumento = {
  v: 2,
  // El bloque del profesional de la ficha de HOY puede haber cambiado (se mudó,
  // cambió el tratamiento): la mezcla NO lo tiene que tomar.
  medico_nombre: "Otro Nombre",
  medico_titulo: "Dr.",
  medico_especialidad: "Otra",
  medico_matricula: "MN 999999",
  medico_domicilio: "Otra calle",
  medico_firma_manuscrita_path: null,
  ...pacienteIncompleto,
  paciente_nombre: "Luciana Toronconte",
};

test("mezclar: reemplaza SOLO el bloque del paciente; el profesional y la versión quedan como se firmaron", () => {
  const anterior: IdentidadDocumento = { v: 2, ...medicoV2, ...pacienteIncompleto };
  const r = mezclarIdentidadRectificada(anterior, fichaCorregida);

  assert.equal(r.v, 2);
  assert.equal(r.paciente_nombre, "Luciana Toronconte");
  // Bloque del profesional: el del documento firmado, no el de hoy.
  assert.equal(r.medico_nombre, medicoV2.medico_nombre);
  assert.equal(r.medico_titulo, medicoV2.medico_titulo);
  assert.equal(r.medico_matricula, medicoV2.medico_matricula);
  assert.equal(r.medico_domicilio, medicoV2.medico_domicilio);
  assert.equal(r.medico_firma_manuscrita_path, medicoV2.medico_firma_manuscrita_path);
  // El resto del paciente viaja desde la ficha.
  assert.equal(r.paciente_dni, fichaCorregida.paciente_dni);
  assert.equal(r.paciente_cuil, fichaCorregida.paciente_cuil);
});

test("mezclar sobre v:1 NO agrega la clave medico_titulo (cambiaría el hash de lo ya firmado)", () => {
  const { medico_titulo: _sinTitulo, ...medicoV1 } = medicoV2;
  void _sinTitulo;
  const anterior: IdentidadDocumento = { v: 1, ...medicoV1, ...pacienteIncompleto };
  const r = mezclarIdentidadRectificada(anterior, fichaCorregida);
  assert.equal(r.v, 1);
  assert.equal("medico_titulo" in r, false);
  assert.equal(r.paciente_nombre, "Luciana Toronconte");
});

test("diferencias: solo las claves del paciente que cambian, con antes y después", () => {
  const anterior: IdentidadDocumento = { v: 2, ...medicoV2, ...pacienteIncompleto };
  const nueva = mezclarIdentidadRectificada(anterior, fichaCorregida);
  const d = diferenciasIdentidadPaciente(anterior, nueva);
  assert.deepEqual(Object.keys(d), ["paciente_nombre"]);
  assert.deepEqual(d.paciente_nombre, { antes: "Luciana", despues: "Luciana Toronconte" });
});

test("diferencias: sin cambios → objeto vacío (la rectificación no tiene nada que hacer)", () => {
  const anterior: IdentidadDocumento = { v: 2, ...medicoV2, ...pacienteIncompleto };
  assert.deepEqual(diferenciasIdentidadPaciente(anterior, { ...anterior }), {});
});
