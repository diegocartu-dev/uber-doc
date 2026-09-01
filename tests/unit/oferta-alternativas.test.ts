// El menú de rescate nombra profesionales y les manda pacientes: quién entra y
// quién queda afuera de la lista es una decisión con reglas de Diego (31/08)
// atrás — jurisdicción del paciente, excluir al que falló, especialidad
// rotulada. Estos tests fijan esas reglas sobre la parte pura de lib/oferta.

import assert from "node:assert/strict";
import { test } from "node:test";
import { seleccionarAlternativas } from "../../src/lib/oferta";

// Un profesional "vivo" para CI: disponible, con precio, sin bloqueos.
// `disponible_desde/hasta` en null → estaEnHorario devuelve `disponible` y el
// test no depende de la hora en que corre.
function medico(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    especialidad: "Clínica médica",
    modalidad_atencion: "ci",
    nombre_completo: "Ana Prueba",
    titulo: "Dra.",
    disponible: true,
    disponible_desde: null,
    disponible_hasta: null,
    disponible_desde_at: "2026-08-31T10:00:00Z",
    precio_consulta: 15000,
    duracion_consulta: 20,
    foto_url: null,
    fotoUrl: null,
    habilitadoIdentidad: true,
    ciBloqueadaPorTurno: false,
    jurisdicciones: ["CABA"],
    especialidadesTodas: ["Clínica médica"],
    enEspera: 0,
    ...over,
  };
}

const base = {
  turnosDisponibles: [] as { medico_id: string; fecha: string; hora_inicio: string }[],
  jurisdiccion: "CABA",
  especialidad: "Clínica médica",
  excluirMedicoId: null as string | null,
};

test("el profesional que acaba de fallar NUNCA aparece, ni aunque sea el único", () => {
  const r = seleccionarAlternativas({
    ...base,
    medicos: [medico({ id: "fallo" })],
    turnosDisponibles: [{ medico_id: "fallo", fecha: "2026-09-01", hora_inicio: "10:00:00" }],
    excluirMedicoId: "fallo",
  });
  assert.equal(r.ciAhora.length, 0);
  assert.equal(r.turnos.length, 0);
});

test("jurisdicción del paciente manda: otra provincia queda afuera de CI y turnos", () => {
  const r = seleccionarAlternativas({
    ...base,
    medicos: [medico({ id: "cordoba", jurisdicciones: ["Córdoba"] })],
    turnosDisponibles: [{ medico_id: "cordoba", fecha: "2026-09-01", hora_inicio: "10:00:00" }],
  });
  assert.equal(r.ciAhora.length, 0);
  assert.equal(r.turnos.length, 0);
});

test("fail-safe vigente: sin jurisdicciones cargadas, el profesional es visible", () => {
  const r = seleccionarAlternativas({ ...base, medicos: [medico({ jurisdicciones: [] })] });
  assert.equal(r.ciAhora.length, 1);
});

test("la misma especialidad va primero, y las ADICIONALES (#451) cuentan como misma", () => {
  const r = seleccionarAlternativas({
    ...base,
    especialidad: "Clínica médica",
    medicos: [
      medico({ id: "otra", especialidad: "Dermatología", especialidadesTodas: ["Dermatología"] }),
      medico({
        id: "cirujana-con-clinica",
        especialidad: "Cirugía plástica y reparadora",
        especialidadesTodas: ["Cirugía plástica y reparadora", "Clínica médica"],
      }),
    ],
  });
  assert.equal(r.ciAhora[0].medicoId, "cirujana-con-clinica");
  assert.equal(r.ciAhora[0].mismaEspecialidad, true, "la adicional cuenta como misma");
  assert.equal(r.ciAhora[1].mismaEspecialidad, false, "la otra queda rotulada como distinta");
});

test("CI exige poder atender AHORA: sin precio, bloqueado por turno o sin identidad quedan afuera", () => {
  const r = seleccionarAlternativas({
    ...base,
    medicos: [
      medico({ id: "sin-precio", precio_consulta: null }),
      medico({ id: "en-turno", ciBloqueadaPorTurno: true }),
      medico({ id: "sin-identidad", habilitadoIdentidad: false }),
      medico({ id: "apagado", disponible: false }),
      medico({ id: "ok" }),
    ],
  });
  assert.deepEqual(r.ciAhora.map((c) => c.medicoId), ["ok"]);
});

test("turnos: el más próximo de la misma especialidad + el más próximo del resto, rotulado y sin repetir", () => {
  const r = seleccionarAlternativas({
    ...base,
    especialidad: "Endocrinología",
    medicos: [
      medico({ id: "endo", especialidad: "Endocrinología", especialidadesTodas: ["Endocrinología"], disponible: false }),
      medico({ id: "clinico", disponible: false }),
    ],
    turnosDisponibles: [
      { medico_id: "clinico", fecha: "2026-09-01", hora_inicio: "09:00:00" },
      { medico_id: "endo", fecha: "2026-09-02", hora_inicio: "10:00:00" },
      { medico_id: "endo", fecha: "2026-09-03", hora_inicio: "11:00:00" },
    ],
  });
  assert.equal(r.turnos.length, 2);
  assert.equal(r.turnos[0].medicoId, "endo", "misma especialidad primero aunque el otro turno sea antes");
  assert.equal(r.turnos[0].fecha, "2026-09-02", "y de los suyos, el más próximo");
  assert.equal(r.turnos[1].medicoId, "clinico");
  assert.equal(r.turnos[1].mismaEspecialidad, false);
});

test("los turnos de un profesional sin identidad habilitada no se ofrecen", () => {
  const r = seleccionarAlternativas({
    ...base,
    medicos: [medico({ id: "sin-id", habilitadoIdentidad: false, disponible: false })],
    turnosDisponibles: [{ medico_id: "sin-id", fecha: "2026-09-01", hora_inicio: "10:00:00" }],
  });
  assert.equal(r.turnos.length, 0);
});

test("menor cola primero dentro de la misma especialidad; FIFO de encendido como desempate", () => {
  const r = seleccionarAlternativas({
    ...base,
    medicos: [
      medico({ id: "con-cola", enEspera: 2 }),
      medico({ id: "libre-tarde", enEspera: 0, disponible_desde_at: "2026-08-31T12:00:00Z" }),
      medico({ id: "libre-temprano", enEspera: 0, disponible_desde_at: "2026-08-31T09:00:00Z" }),
    ],
    maxCI: 3,
  });
  assert.deepEqual(r.ciAhora.map((c) => c.medicoId), ["libre-temprano", "libre-tarde", "con-cola"]);
});

test("los topes cortan: 2 de CI por defecto", () => {
  const r = seleccionarAlternativas({
    ...base,
    medicos: [medico({ id: "a" }), medico({ id: "b" }), medico({ id: "c" })],
  });
  assert.equal(r.ciAhora.length, 2);
});
