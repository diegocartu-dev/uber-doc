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
  deltaDeAsignacion,
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

// ── R6 FLEXIBLE (Diego, 13/08) ───────────────────────────────────────────────
// El acuerdo es el PISO de servicio, no un techo: con la semana cumplida el
// profesional BAJA DE PRIORIDAD, pero su horario publicado se puede tomar. Esta
// batería reemplaza a la que fijaba lo contrario (`seleccionable:false` y slots
// vaciados): si alguien vuelve a "optimizar" esa versión, estos tests rompen.

test("acuerdo completo CON horarios publicados: último, pero elegible y con sus slots (R6)", () => {
  const lista = priorizarOferta([
    medico({
      medico_id: "m-completo",
      nombre: "Dra. Carla Gómez",
      asignados: 4,
      acuerdo: 4,
      slots: [slot("t9", "2026-10-20", "08:00:00")],
    }),
    medico({ medico_id: "m-3de4", nombre: "Dr. Tres", asignados: 3, acuerdo: 4, slots: [slot("t8", "2026-10-24", "08:00:00")] }),
  ]);
  assert.deepEqual(lista.map((p) => p.medico_id), ["m-3de4", "m-completo"]);
  const completo = lista[1];
  assert.equal(completo.acuerdo_completo, true, "sigue marcado como completo: la pantalla lo agrupa aparte");
  assert.equal(completo.seleccionable, true, "el turno publicado se puede tomar igual");
  // Y sus horarios viajan: sin esto la fila se abre vacía y el slot libre es
  // inalcanzable desde la pantalla.
  assert.equal(completo.slots_semana.flatMap((d) => d.horas).length, 1);
  assert.deepEqual(completo.proximo, { fecha: "2026-10-20", hora: "08:00" });
});

test("acuerdo completo con CI activa: también elegible (la habilitó el propio profesional)", () => {
  const lista = priorizarOferta([
    medico({ medico_id: "m-ci-completo", ci_activa: true, activa_desde: "14:05", asignados: 4, acuerdo: 4 }),
  ]);
  assert.equal(lista[0].categoria, "ci_activa");
  assert.equal(lista[0].seleccionable, true);
});

test("acuerdo completo SIN nada publicado: se lista al final, y esa sí no se elige", () => {
  const lista = priorizarOferta([
    medico({ medico_id: "m-gomez", nombre: "Dra. Carla Gómez", asignados: 4, acuerdo: 4, slots: [] }),
    medico({ medico_id: "m-libre", nombre: "Dr. Libre", ci_activa: true, asignados: 0 }),
  ]);
  assert.equal(lista[lista.length - 1].medico_id, "m-gomez");
  assert.equal(lista[lista.length - 1].acuerdo_completo, true);
  // No hay nada que tomar: no es el acuerdo lo que la apaga, es la agenda vacía.
  assert.equal(lista[lista.length - 1].seleccionable, false);
  assert.deepEqual(lista[lista.length - 1].slots_semana, []);
});

test("el completo cae al final aunque su categoría sea mejor (deprioriza, no bloquea)", () => {
  const lista = priorizarOferta([
    medico({ medico_id: "m-ci-lleno", ci_activa: true, asignados: 4, acuerdo: 4 }),
    medico({ medico_id: "m-turnos", asignados: 3, acuerdo: 4, slots: [slot("t1", "2026-10-22", "09:00:00")] }),
  ]);
  assert.deepEqual(lista.map((p) => p.medico_id), ["m-turnos", "m-ci-lleno"]);
  assert.equal(lista[1].seleccionable, true);
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

// ─────────────────────────────────────────────────────────────────────────────
// EL CONTADOR DE EQUIDAD — qué mueve cada fila de `asignaciones`
// ─────────────────────────────────────────────────────────────────────────────

test("una reprogramación SUMA al que recibe: la fila registra a quien se queda con el paciente", () => {
  // `reprogramada` valía 0. Consecuencia exacta el día que se reprograma la
  // agenda de un profesional: los que RECIBÍAN sus pacientes no movían su
  // contador, así que seguían primeros en la fila de equidad (asignados ASC) y
  // se les seguía apilando trabajo; y el que no atendió a nadie conservaba sus
  // asignaciones y bajaba de prioridad. La equidad invertida justo el día que
  // más se la necesita, y el "X de Y" del turnero mintiendo.
  assert.equal(deltaDeAsignacion("asignada"), 1);
  assert.equal(deltaDeAsignacion("reprogramada"), 1);
  assert.equal(deltaDeAsignacion("cancelada"), -1);
});

test("las acciones que no reparten pacientes no mueven el contador", () => {
  assert.equal(deltaDeAsignacion("reenvio_aviso"), 0);
  assert.equal(deltaDeAsignacion("gestion_manual"), 0);
  assert.equal(deltaDeAsignacion("una_accion_que_no_existe"), 0);
});

test("mover a un paciente entre dos horarios del MISMO profesional no lo cuenta dos veces", () => {
  // `reprogramarTurnoInstitucional` escribe SIEMPRE el par: `reprogramada` para
  // el que recibe y `cancelada` para el que pierde, aunque sean el mismo. Neto
  // 0 — sigue siendo un paciente, no dos.
  const neto = deltaDeAsignacion("reprogramada") + deltaDeAsignacion("cancelada");
  assert.equal(neto, 0);
});

test("mover a un paciente ENTRE profesionales le suma a uno y le resta al otro", () => {
  const recibe = deltaDeAsignacion("asignada") + deltaDeAsignacion("reprogramada");
  const pierde = deltaDeAsignacion("asignada") + deltaDeAsignacion("cancelada");
  assert.equal(recibe, 2, "el que recibe pasa a tener dos pacientes");
  assert.equal(pierde, 0, "el que pierde vuelve a cero y sube en la fila de equidad");
});
