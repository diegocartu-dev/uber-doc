// El orden de la clínica: disponibilidad primero, y dentro de cada grupo, precio
// de menor a mayor. La trampa que este archivo existe para no repetir: sin precio
// cargado, `Number(null)` da 0 y los 31 profesionales sin precio quedarían ARRIBA
// de todos.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ordenarMedicos } from "../../src/app/clinica/disponibilidad";

type M = Parameters<typeof ordenarMedicos>[0][number];
const base = {
  especialidad: "Clínica médica", modalidad_atencion: null, titulo: null,
  disponible: true, disponible_desde: "00:00:00", disponible_hasta: "23:59:00",
  disponible_desde_at: null, duracion_consulta: 30, foto_url: null,
  habilitadoIdentidad: true, ciBloqueadaPorTurno: false, jurisdicciones: ["CABA"],
};
const med = (id: string, precio: number | null): M =>
  ({ ...base, id, nombre_completo: id, precio_consulta: precio }) as unknown as M;

const vacio = { esperas: new Map<string, number>(), turnos: new Map(), conTurnos: new Set<string>() };
const ordenar = (ms: M[]) => ordenarMedicos(ms, vacio.esperas, vacio.turnos as never, vacio.conTurnos).map((m) => m.id);

test("dentro del mismo grupo, el más barato va primero", () => {
  const r = ordenar([med("caro", 45000), med("barato", 15000), med("medio", 20000)]);
  assert.deepEqual(r, ["barato", "medio", "caro"]);
});

test("sin precio cargado va AL FINAL, nunca primero", () => {
  // Con `Number(null) === 0` este caso pondría "sinPrecio" arriba de todos, que
  // es exactamente el bug que la mitad del padrón habría disparado.
  const r = ordenar([med("caro", 45000), med("sinPrecio", null), med("barato", 15000)]);
  assert.deepEqual(r, ["barato", "caro", "sinPrecio"]);
});

test("un precio en cero se trata como sin precio, no como el más barato", () => {
  const r = ordenar([med("cero", 0), med("barato", 15000)]);
  assert.deepEqual(r, ["barato", "cero"]);
});

test("la disponibilidad sigue mandando sobre el precio", () => {
  // El caro está en horario y el barato no: el caro va primero igual, porque el
  // paciente que entra a la clínica quiere que lo atiendan ahora.
  const caroDisponible = med("caroAhora", 45000);
  const baratoFuera = { ...med("baratoFuera", 15000), disponible: false } as M;
  const r = ordenar([baratoFuera, caroDisponible]);
  assert.equal(r[0], "caroAhora");
});

test("el más barato va arriba aunque tenga cola (Diego, 29/09)", () => {
  // Antes la cola partía el grupo de consulta inmediata ANTES del precio: el
  // caro sin nadie esperando quedaba arriba del barato con uno en la fila.
  const esperas = new Map<string, number>([["barato", 3]]);
  const r = ordenarMedicos(
    [med("caro", 45000), med("barato", 15000)],
    esperas,
    new Map() as never,
    new Set<string>(),
  ).map((m) => m.id);
  assert.deepEqual(r, ["barato", "caro"]);
});

test("con el mismo precio, menos cola primero", () => {
  const esperas = new Map<string, number>([["conCola", 2]]);
  const r = ordenarMedicos(
    [med("conCola", 20000), med("sinCola", 20000)],
    esperas,
    new Map() as never,
    new Set<string>(),
  ).map((m) => m.id);
  assert.deepEqual(r, ["sinCola", "conCola"]);
});
