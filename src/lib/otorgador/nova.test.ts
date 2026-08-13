// Tests del parser de Nova (src/lib/otorgador/nova.ts).
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// ── POR QUÉ ESTOS CASOS ──────────────────────────────────────────────────────
// El parser es la parte de Nova que se equivoca, y sus dos errores caros son:
// entenderle mal A QUIÉN se le vacía la agenda, y entenderle mal QUÉ DÍA. Los
// dos terminan en cuatro pacientes reprogramados que no había que tocar.
//
// Datos sintéticos: el repo es público. Ningún profesional de acá existe.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fechaDelTexto,
  interpretarPedido,
  profesionalDelTexto,
  textoCierre,
  textoPropuesta,
  type ProfesionalConocido,
} from "@/lib/otorgador/nova";

const PADRON: ProfesionalConocido[] = [
  { id: "m1", nombre: "Dr. Pedro Pérez Ruiz", especialidad: "Clínica Médica" },
  { id: "m2", nombre: "Dra. Laura Fernández", especialidad: "Clínica Médica" },
  { id: "m3", nombre: "Dr. Marcos Ruiz", especialidad: "Cardiología" },
  { id: "m4", nombre: "Dra. Ana Sosa", especialidad: "Pediatría" },
];

/** Un lunes: sirve de "hoy" para todos los casos relativos. */
const HOY = "2026-10-19";

// ─── A quién ────────────────────────────────────────────────────────────────

test("reconoce al profesional por apellido, con o sin título", () => {
  for (const texto of [
    "El Dr. Pérez Ruiz no puede atender el martes 20.",
    "perez ruiz no atiende el 20/10",
    "Pedro Pérez Ruiz no puede el martes",
  ]) {
    const r = profesionalDelTexto(texto, PADRON);
    assert.ok(r && "unico" in r, texto);
    assert.equal(r.unico.id, "m1", texto);
  }
});

test("gana el que empareja MÁS palabras, no el primero de la lista", () => {
  // "Ruiz" solo empareja a los dos; "Marcos Ruiz" desempata sin ambigüedad.
  const r = profesionalDelTexto("El Dr. Marcos Ruiz no puede el martes", PADRON);
  assert.ok(r && "unico" in r);
  assert.equal(r.unico.id, "m3");
});

test("dos apellidos iguales NO se resuelven a dedo: se pregunta", () => {
  const r = profesionalDelTexto("Ruiz no puede atender el martes 20", PADRON);
  assert.ok(r && "candidatos" in r, "tendría que quedar ambiguo");
  assert.deepEqual(
    r.candidatos.map((c) => c.id).sort(),
    ["m1", "m3"],
    "los dos Ruiz tienen que quedar como candidatos"
  );
});

test("los títulos y las muletillas no cuentan como identidad", () => {
  // Sin esto, "el doctor no puede atender" emparejaría con cualquiera que
  // tuviera "Dr." en el nombre — o sea, con casi todo el padrón.
  assert.equal(profesionalDelTexto("El doctor no puede atender mañana", PADRON), null);
});

// ─── Qué día ────────────────────────────────────────────────────────────────

test("fechas numéricas: 20/10, 20-10, con año", () => {
  assert.equal(fechaDelTexto("no puede el 20/10", HOY), "2026-10-20");
  assert.equal(fechaDelTexto("no puede el 20-10", HOY), "2026-10-20");
  assert.equal(fechaDelTexto("no puede el 20/10/2027", HOY), "2027-10-20");
});

test("fechas en palabras: 20 de octubre / 3 de noviembre", () => {
  assert.equal(fechaDelTexto("el 20 de octubre", HOY), "2026-10-20");
  assert.equal(fechaDelTexto("el 3 de noviembre", HOY), "2026-11-03");
  assert.equal(fechaDelTexto("el 3 de setiembre", HOY), "2027-09-03"); // ya pasó: el que viene
});

test("día de la semana con número, y a secas", () => {
  assert.equal(fechaDelTexto("el martes 20", HOY), "2026-10-20");
  // "el martes" sin número: el próximo martes desde el lunes 19.
  assert.equal(fechaDelTexto("el martes no puede", HOY), "2026-10-20");
  // Hoy es lunes: "el lunes" es HOY, no el de la semana que viene.
  assert.equal(fechaDelTexto("el lunes no puede", HOY), "2026-10-19");
});

test("hoy y mañana", () => {
  assert.equal(fechaDelTexto("hoy no puede atender", HOY), "2026-10-19");
  assert.equal(fechaDelTexto("mañana no puede atender", HOY), "2026-10-20");
});

test("un día suelto que ya pasó se entiende como el del mes que viene", () => {
  // El 5 ya pasó (hoy es 19): pedir "el 5" no puede devolver una fecha del
  // pasado, porque una agenda que ya ocurrió no se reprograma.
  assert.equal(fechaDelTexto("el 5 no puede atender", HOY), "2026-11-05");
});

test("una fecha que no existe no se inventa", () => {
  assert.equal(fechaDelTexto("el 31/02", HOY), null);
  assert.equal(fechaDelTexto("el 45/13", HOY), null);
});

test("sin ninguna pista de fecha, devuelve null", () => {
  assert.equal(fechaDelTexto("no puede atender", HOY), null);
});

// ─── El pedido completo ─────────────────────────────────────────────────────

test("el caso del mock, punta a punta", () => {
  const r = interpretarPedido("El Dr. Pérez Ruiz no puede atender el martes 20.", PADRON, HOY);
  assert.deepEqual(r, {
    tipo: "reprogramar_dia",
    medicoId: "m1",
    medicoNombre: "Dr. Pedro Pérez Ruiz",
    fecha: "2026-10-20",
  });
});

test("con profesional y sin fecha, pregunta por la fecha", () => {
  const r = interpretarPedido("Pérez Ruiz no va a poder atender", PADRON, HOY);
  assert.equal(r.tipo, "falta_fecha");
});

test("un pedido de reprogramación sin profesional pregunta por el profesional", () => {
  const r = interpretarPedido("hay que reprogramar el 20/10", PADRON, HOY);
  assert.equal(r.tipo, "falta_profesional");
});

test("lo que Nova no sabe hacer, lo dice: no adivina", () => {
  // Este es el punto de la V1 honesta: sin LLM, un pedido fuera del único caso
  // soportado NO se fuerza a encajar.
  for (const texto of ["¿cuántas consultas hubo esta semana?", "dame el CSV de octubre", "hola"]) {
    assert.equal(interpretarPedido(texto, PADRON, HOY).tipo, "no_entiendo", texto);
  }
});

// ─── El copy (03-spec §5.3) ─────────────────────────────────────────────────

test("el texto de la propuesta es el del mock, y siempre dice que no cambió nada", () => {
  const t = textoPropuesta({
    medicoNombre: "Dr. Pedro Pérez Ruiz",
    turnos: 4,
    fechaCorta: "martes 20/10",
    especialidad: "Clínica Médica",
  });
  assert.match(t, /^Entendido\. Dr\. Pedro Pérez Ruiz tiene 4 turnos asignados el martes 20\/10\./);
  assert.match(t, /profesionales de Clínica Médica con lugares libres/);
  assert.match(t, /todavía no cambié nada\.$/);
});

test("el cierre nombra lo que quedó para gestión manual", () => {
  const t = textoCierre({
    reasignados: 3,
    pacientes: 3,
    profesionales: 2,
    manuales: ["Paciente Sintético"],
  });
  assert.match(t, /^Listo\. Reasigné 3 turnos y avisé a los 3 pacientes y a los 2 profesionales\./);
  assert.match(t, /Paciente Sintético quedó marcado para gestión manual en el turnero\.$/);
});

test("el cierre en singular no queda escrito como un robot", () => {
  const t = textoCierre({ reasignados: 1, pacientes: 1, profesionales: 1, manuales: [] });
  assert.equal(t, "Listo. Reasigné 1 turno y avisé a 1 paciente y a 1 profesional.");
});
