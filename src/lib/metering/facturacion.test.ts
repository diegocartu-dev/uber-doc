// Tests de la FACTURA y de las etiquetas del panel — runner: node:test + tsx.
//
// Lo que se testea acá es lo que un humano va a leer en un archivo que después
// discute plata: el CSV. Los errores caros de un export no son de cálculo, son
// de formato — una coma dentro de un nombre que parte la fila en dos, un
// período mal parseado que trae el mes equivocado, un total que no coincide
// con las líneas de arriba.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodoValido,
  rangoDePeriodo,
  nombreDePeriodo,
  periodoDeHoy,
  pesos,
  facturacionACSV,
  type Facturacion,
} from "@/lib/metering/facturacion";
import { etiquetaDia, lecturaDelChart } from "@/lib/metering/panel";

const facturacion = (): Facturacion => ({
  periodo: "2026-10",
  consultas: 2,
  precio_centavos: 1_500_000,
  total_centavos: 3_000_000,
  lineas: [
    {
      fecha_ar: "2026-10-20",
      tipo: "turno",
      recurso_id: "00000000-0000-4000-8000-000000000001",
      motor: "acordado",
      especialidad: "Clínica Médica",
      // Nombre con coma: el caso que parte el CSV si nadie lo escapa.
      profesional: "Apellido, Nombre",
      segundos_ambos_en_sala: 640,
      documentos_emitidos: 1,
      precio_centavos: 1_500_000,
    },
    {
      fecha_ar: "2026-10-21",
      tipo: "consulta",
      recurso_id: "00000000-0000-4000-8000-000000000002",
      motor: "espontaneo",
      especialidad: null,
      profesional: 'Con "comillas"',
      segundos_ambos_en_sala: 40,
      documentos_emitidos: 1,
      precio_centavos: 1_500_000,
    },
  ],
});

test("período · solo AAAA-MM con un mes que exista", () => {
  assert.equal(periodoValido("2026-10"), true);
  assert.equal(periodoValido("2026-13"), false);
  assert.equal(periodoValido("2026-00"), false);
  assert.equal(periodoValido("octubre"), false);
  assert.equal(periodoValido("2026-1"), false);
  // El parámetro viene de la URL: nada de inyectarlo en una query sin validar.
  assert.equal(periodoValido("2026-10' OR 1=1"), false);
});

test("período · el rango cubre el mes entero, incluidos los de 31 y febrero", () => {
  assert.deepEqual(rangoDePeriodo("2026-10"), { desde: "2026-10-01", hasta: "2026-10-31" });
  assert.deepEqual(rangoDePeriodo("2026-02"), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.deepEqual(rangoDePeriodo("2028-02"), { desde: "2028-02-01", hasta: "2028-02-29" });
});

test("período · el nombre del mes va en mayúscula, como el mock", () => {
  assert.equal(nombreDePeriodo("2026-10"), "Octubre");
  assert.equal(nombreDePeriodo("2026-01"), "Enero");
});

test("período · el de hoy se corta en hora argentina, no en UTC", () => {
  // 31/10 a las 22:00 ART todavía es octubre (en UTC ya sería el 1/11).
  assert.equal(periodoDeHoy(Date.parse("2026-10-31T22:00:00-03:00")), "2026-10");
  assert.equal(periodoDeHoy(Date.parse("2026-11-01T00:30:00-03:00")), "2026-11");
});

test("CSV · una coma en un nombre no parte la fila", () => {
  const csv = facturacionACSV(facturacion());
  const filas = csv.split("\r\n");
  assert.ok(filas[1].includes('"Apellido, Nombre"'));
  assert.ok(filas[2].includes('"Con ""comillas"""'));
});

test("CSV · el total coincide con las líneas y va al final", () => {
  const csv = facturacionACSV(facturacion());
  const filas = csv.trim().split("\r\n");
  const total = filas[filas.length - 1].split(";");
  assert.equal(total[0], "TOTAL");
  assert.equal(total[7], "2"); // consultas
  assert.equal(total[8], "30000.00"); // 2 × $15.000
});

test("CSV · arranca con BOM (el Excel en español abre bien los acentos)", () => {
  assert.equal(facturacionACSV(facturacion()).charCodeAt(0), 0xfeff);
});

test("plata · los centavos se muestran en pesos, sin decimales", () => {
  assert.ok(pesos(1_500_000).includes("15.000"));
});

test("chart · las etiquetas de día son las del mock", () => {
  assert.equal(etiquetaDia("2026-10-19"), "Lun 19");
  assert.equal(etiquetaDia("2026-10-25"), "Dom 25");
});

test("chart · la lectura nombra al motor que concentra, con su porcentaje", () => {
  assert.equal(
    lecturaDelChart({ acordado: 61, espontaneo: 14, ofrecido: 12 }, 87),
    "El motor Acordado concentra el 70% de las consultas de la semana."
  );
});

test("chart · sin consultas la lectura lo dice, no inventa un 0%", () => {
  assert.equal(
    lecturaDelChart({ acordado: 0, espontaneo: 0, ofrecido: 0 }, 0),
    "Todavía no hay consultas facturables en esta semana."
  );
});
