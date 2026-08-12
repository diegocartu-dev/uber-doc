// Tests de la priorización del otorgador — parte PURA (spec institucional
// §4.4; regla madre 04-spec §1.4: la pantalla pinta, la API ordena).
// Runner: node:test + node:assert, con tsx:
//   npx tsx --test src/lib/otorgador/oferta.test.ts
//
// Datos 100% SINTÉTICOS (los del mock aprobado — jamás personas reales).

process.env.INSTITUCIONAL = "true"; // los módulos importados gatean por modo

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priorizarOferta,
  cupoSemanal,
  dentroVentanaCI,
  type MedicoParaPriorizar,
} from "./oferta";

function medico(overrides: Partial<MedicoParaPriorizar>): MedicoParaPriorizar {
  return {
    medico_id: "00000000-0000-0000-0000-000000000000",
    nombre: "Dra. Prueba",
    especialidad: "Clínica Médica",
    ci_activa: false,
    activa_desde: null,
    asignados: 0,
    acuerdo: 4,
    slots: [],
    ...overrides,
  };
}

const slot = (turno_id: string, fecha: string, hora: string, canal: "acordado" | "ofrecido" = "acordado") => ({
  turno_id,
  fecha,
  hora,
  canal,
});

test("escena canónica del mock: CI primero, acordados por asignados ASC, dedup", () => {
  const lista = priorizarOferta([
    medico({ medico_id: "m-perez", nombre: "Dr. Pedro Pérez Ruiz", asignados: 3, slots: [slot("t1", "2026-10-20", "16:30:00"), slot("t2", "2026-10-22", "10:00:00")] }),
    medico({ medico_id: "m-ruiz", nombre: "Dr. Marcos Ruiz", asignados: 1, slots: [slot("t3", "2026-10-19", "17:15:00")] }),
    medico({ medico_id: "m-fernandez", nombre: "Dra. Laura Fernández", ci_activa: true, activa_desde: "14:05", asignados: 1, slots: [slot("t4", "2026-10-21", "09:30:00")] }),
  ]);

  assert.deepEqual(
    lista.map((p) => p.medico_id),
    ["m-fernandez", "m-ruiz", "m-perez"]
  );
  assert.equal(lista[0].categoria, "ci_activa");
  assert.equal(lista[0].activa_desde, "14:05");
  // Dedup: la CI activa con agenda muestra sus slots ADENTRO (una sola fila).
  assert.equal(lista[0].slots_semana.length, 1);
  assert.equal(lista[1].categoria, "turno_acordado");
  assert.equal(lista[2].categoria, "turno_acordado");
  // "Próximo" del expandible: primer slot cronológico.
  assert.deepEqual(lista[2].proximo, { fecha: "2026-10-20", hora: "16:30" });
});

test("categoría por mejor motor: solo-ofrecido cae a turno_ofrecido, mixto sube a acordado", () => {
  const lista = priorizarOferta([
    medico({ medico_id: "m-garcia", nombre: "Dr. Juan García", asignados: 2, slots: [slot("t1", "2026-10-22", "16:00:00", "ofrecido")] }),
    medico({ medico_id: "m-mixto", nombre: "Dra. Mixta", asignados: 2, slots: [slot("t2", "2026-10-22", "17:00:00", "ofrecido"), slot("t3", "2026-10-23", "09:00:00", "acordado")] }),
  ]);
  const garcia = lista.find((p) => p.medico_id === "m-garcia");
  const mixta = lista.find((p) => p.medico_id === "m-mixto");
  assert.equal(garcia?.categoria, "turno_ofrecido");
  assert.equal(mixta?.categoria, "turno_acordado");
  // …con TODA su oferta adentro (los dos canales mezclados, etiquetados).
  assert.equal(mixta?.slots_semana.flatMap((d) => d.horas).length, 2);
});

test("acuerdo completo: al final, seleccionable false, sin slots (R6 / 04-spec §1.5.5)", () => {
  const lista = priorizarOferta([
    medico({ medico_id: "m-gomez", nombre: "Dra. Carla Gómez", asignados: 4, acuerdo: 4, slots: [] }),
    medico({ medico_id: "m-libre", nombre: "Dr. Libre", ci_activa: true, asignados: 0 }),
  ]);
  assert.equal(lista[lista.length - 1].medico_id, "m-gomez");
  assert.equal(lista[lista.length - 1].seleccionable, false);
  assert.equal(lista[lista.length - 1].acuerdo_completo, true);
  assert.deepEqual(lista[lista.length - 1].slots_semana, []);
  // Y aunque tuviera slots, completo va al final igual:
  const conSlots = priorizarOferta([
    medico({ medico_id: "m-completo", asignados: 4, acuerdo: 4, slots: [slot("t9", "2026-10-20", "08:00:00")] }),
    medico({ medico_id: "m-3de4", asignados: 3, acuerdo: 4, slots: [slot("t8", "2026-10-24", "08:00:00")] }),
  ]);
  assert.deepEqual(conSlots.map((p) => p.medico_id), ["m-3de4", "m-completo"]);
});

test("sin CI, sin slots y sin acuerdo completo: no aparece (nada que ofrecer)", () => {
  const lista = priorizarOferta([medico({ medico_id: "m-vacio", asignados: 1 })]);
  assert.equal(lista.length, 0);
});

test("tiebreak con mismos asignados: próximo slot más cercano primero", () => {
  const lista = priorizarOferta([
    medico({ medico_id: "m-tarde", asignados: 1, slots: [slot("t1", "2026-10-22", "10:00:00")] }),
    medico({ medico_id: "m-pronto", asignados: 1, slots: [slot("t2", "2026-10-19", "17:15:00")] }),
  ]);
  assert.deepEqual(lista.map((p) => p.medico_id), ["m-pronto", "m-tarde"]);
});

test("slots agrupados por día, ordenados, con etiqueta 'Mar 20/10'", () => {
  const lista = priorizarOferta([
    medico({
      medico_id: "m-perez",
      slots: [
        slot("t2", "2026-10-22", "10:15:00"),
        slot("t1", "2026-10-20", "16:45:00"),
        slot("t0", "2026-10-20", "16:30:00"),
        slot("t3", "2026-10-22", "10:00:00"),
      ],
    }),
  ]);
  const dias = lista[0].slots_semana;
  assert.equal(dias[0].dia, "Mar 20/10");
  assert.deepEqual(dias[0].horas.map((h) => h.hora), ["16:30", "16:45"]);
  assert.equal(dias[1].dia, "Jue 22/10");
  assert.deepEqual(dias[1].horas.map((h) => h.hora), ["10:00", "10:15"]);
});

test("cupoSemanal: la conversión horas→consultas vive en un solo lugar", () => {
  assert.equal(cupoSemanal(1, 15), 4);
  assert.equal(cupoSemanal(4, 15), 16);
  assert.equal(cupoSemanal(1, 20), 3);
  assert.equal(cupoSemanal(0.5, 20), 1);
  assert.equal(cupoSemanal(0, 15), 0);
  assert.equal(cupoSemanal(1, 0), 0);
});

test("dentroVentanaCI: bordes de la ventana en hora AR", () => {
  const config = { ci_ventana_inicio: "08:00:00", ci_ventana_fin: "20:00:00" };
  // 11:00 UTC = 08:00 AR → abierta (inclusive); 22:59 UTC = 19:59 AR → abierta;
  // 23:00 UTC = 20:00 AR → cerrada; 10:59 UTC = 07:59 AR → cerrada.
  assert.equal(dentroVentanaCI(config, new Date("2026-10-19T11:00:00Z")), true);
  assert.equal(dentroVentanaCI(config, new Date("2026-10-19T22:59:00Z")), true);
  assert.equal(dentroVentanaCI(config, new Date("2026-10-19T23:00:00Z")), false);
  assert.equal(dentroVentanaCI(config, new Date("2026-10-19T10:59:00Z")), false);
});
