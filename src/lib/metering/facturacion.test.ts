// Tests de la FACTURA y de las etiquetas del panel — runner: node:test + tsx.
//
// Lo que se testea acá es lo que un humano va a leer en un archivo que después
// discute plata: el CSV. Los errores caros de un export no son de cálculo, son
// de formato — una coma dentro de un nombre que parte la fila en dos, un
// período mal parseado que trae el mes equivocado, un total que no coincide
// con las líneas de arriba.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  periodoValido,
  rangoDePeriodo,
  nombreDePeriodo,
  periodoDeHoy,
  periodoDeSemana,
  corteDePeriodo,
  mesTerminado,
  periodoASellar,
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
  total_estimado: false,
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

test("período · el de la card sale de la SEMANA que se está mirando, no de hoy", () => {
  assert.equal(periodoDeSemana("2026-10-19"), "2026-10");
  // Una semana a caballo de dos meses se factura donde empezó.
  assert.equal(periodoDeSemana("2026-10-26"), "2026-10");
  assert.equal(periodoDeSemana("2026-11-02"), "2026-11");
});

test("período · el corte es hoy si el mes está en curso, y el fin de mes si ya pasó", () => {
  assert.equal(corteDePeriodo("2026-10", "2026-10-25"), "2026-10-25");
  // El 13 de noviembre, octubre sigue cortando el 31 de octubre.
  assert.equal(corteDePeriodo("2026-10", "2026-11-13"), "2026-10-31");
  // Un mes que todavía no empezó no corta "ayer".
  assert.equal(corteDePeriodo("2026-12", "2026-11-13"), "2026-12-01");
});

test("CSV · una coma en un nombre no parte la fila", () => {
  const csv = facturacionACSV(facturacion());
  const filas = csv.split("\r\n");
  assert.ok(filas[1].includes('"Apellido, Nombre"'));
  assert.ok(filas[2].includes('"Con ""comillas"""'));
});

test("CSV · un nombre que arranca con = no se ejecuta como fórmula en Excel", () => {
  const f = facturacion();
  f.lineas[0].profesional = "=HYPERLINK(\"http://ejemplo\",\"click\")";
  f.lineas[1].especialidad = "+49";
  const filas = facturacionACSV(f).split("\r\n");
  // El apóstrofo adelante: Excel lo abre como texto, no como fórmula.
  assert.ok(filas[1].includes("'=HYPERLINK"));
  assert.ok(filas[2].includes("'+49"));
  // Los números siguen siendo números: el total no se rompe.
  assert.equal(filas[filas.length - 2].split(";")[8], "30000.00");
});

test("CSV · el total coincide con las líneas y va al final", () => {
  const csv = facturacionACSV(facturacion());
  const filas = csv.trim().split("\r\n");
  const total = filas[filas.length - 1].split(";");
  assert.equal(total[0], "TOTAL");
  assert.equal(total[7], "2"); // consultas
  assert.equal(total[8], "30000.00"); // 2 × $15.000
});

test("CSV · cada línea lleva SU precio, aunque el del config haya cambiado después", () => {
  // El caso: octubre se facturó a $15.000 y en enero se actualizó el precio.
  // El CSV de octubre tiene que seguir diciendo lo mismo, línea por línea y en
  // el total — si no, el papel que respalda una factura ya emitida deja de ser
  // reproducible.
  const f = facturacion();
  f.lineas[1].precio_centavos = 2_000_000; // esta consulta se facturó más cara
  f.total_centavos = f.lineas.reduce((s, l) => s + l.precio_centavos, 0);
  const filas = facturacionACSV(f).trim().split("\r\n");
  assert.equal(filas[1].split(";")[8], "15000.00");
  assert.equal(filas[2].split(";")[8], "20000.00");
  assert.equal(filas[filas.length - 1].split(";")[8], "35000.00");
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

// ─────────────────────────────────────────────────────────────────────────────
// EL CIERRE DEL MES (R31-R32, Diego 13/08)
// ─────────────────────────────────────────────────────────────────────────────
// La parte pura: cuándo terminó un mes y cuál es el que hay que cerrar. Es la
// aritmética que decide si se sella una foto entera o media — y el sello es
// inmutable, así que un borde mal calculado no se arregla con un deploy.

const ar = (iso: string) => Date.parse(iso); // los ISO de abajo llevan -03:00

test("mes terminado · el corte es 23:59:59 del último día, hora AR", () => {
  // Un minuto antes de la medianoche del 31: octubre sigue abierto.
  assert.equal(mesTerminado("2026-10", ar("2026-10-31T23:59:00-03:00")), false);
  // Un segundo después: octubre es una foto.
  assert.equal(mesTerminado("2026-10", ar("2026-11-01T00:00:01-03:00")), true);
  // Y la hora del cron (02:00 del día 1) cae del lado correcto.
  assert.equal(mesTerminado("2026-10", ar("2026-11-01T02:00:00-03:00")), true);
});

test("mes terminado · febrero corto y meses de 31: el último día sale del calendario", () => {
  assert.equal(mesTerminado("2026-02", ar("2026-02-28T23:00:00-03:00")), false);
  assert.equal(mesTerminado("2026-02", ar("2026-03-01T00:30:00-03:00")), true);
  // Bisiesto: 2028 tiene 29 días. El 29 a la tarde todavía no cerró.
  assert.equal(mesTerminado("2028-02", ar("2028-02-29T18:00:00-03:00")), false);
});

test("el mes a sellar es el ANTERIOR en hora AR, no en UTC", () => {
  // 01/11 a las 02:00 ART: el cron cierra octubre.
  assert.equal(periodoASellar(ar("2026-11-01T02:00:00-03:00")), "2026-10");
  // Cambio de año: el 1 de enero se cierra diciembre del año que pasó.
  assert.equal(periodoASellar(ar("2027-01-01T02:00:00-03:00")), "2026-12");
  // El borde que importa: 31/10 a las 22:00 ART es 01/11 en UTC. Leído en UTC,
  // el cron creería que ya es día 1 y cerraría octubre con un día entero de
  // atenciones todavía por delante.
  assert.equal(periodoASellar(ar("2026-10-31T22:00:00-03:00")), "2026-09");
});

test("el mes en curso NUNCA es el que se cierra", () => {
  const ahora = ar("2026-11-14T10:00:00-03:00");
  const aSellar = periodoASellar(ahora);
  assert.equal(aSellar, "2026-10");
  assert.equal(mesTerminado(aSellar, ahora), true, "el que se sella siempre terminó");
  assert.equal(mesTerminado("2026-11", ahora), false, "el mes en curso, jamás");
});

// ─────────────────────────────────────────────────────────────────────────────
// QUÉ ALCANZA EL SELLO — leído del código, porque es un UPDATE
// ─────────────────────────────────────────────────────────────────────────────
// Estos dos tests miran el FUENTE de `facturacion.ts` en vez de llamar a la
// función, por el mismo motivo que los tests de la 021 leen el `.sql`: la regla
// no vive en una decisión pura que se pueda invocar, vive en los filtros de una
// query contra Postgres. Un test que llamara a `sellarPeriodo` con una base
// falsa probaría la base falsa.
//
// Lo que pinchan es un bug real y silencioso: el sello marcaba SOLO
// `clasificacion = 'facturable'`, así que el resto del mes quedaba sin sellar
// —reescribible por el job durante 14 días e inalcanzable por la puerta de
// R33—, y una consulta "corta" del 31 podía volverse facturable el 3 del mes
// siguiente sobre una factura ya emitida.

const FUENTE = readFileSync(join(process.cwd(), "src/lib/metering/facturacion.ts"), "utf8");

/** El cuerpo de una función exportada de este archivo, hasta el `\n}` de cierre. */
function cuerpoDe(nombre: string): string {
  const inicio = FUENTE.indexOf(`export async function ${nombre}(`);
  assert.notEqual(inicio, -1, `no se encontró ${nombre} en facturacion.ts`);
  const fin = FUENTE.indexOf("\n}", inicio);
  assert.notEqual(fin, -1, `no se encontró el final de ${nombre}`);
  return FUENTE.slice(inicio, fin);
}

test("sello · congela el MES ENTERO, no solo lo facturable", () => {
  const sello = cuerpoDe("sellarPeriodo");
  assert.ok(
    !/\.eq\(\s*["']clasificacion["']/.test(sello),
    "el sello no puede filtrar por clasificación: lo que no sella queda reescribible por el job y fuera de la puerta de R33"
  );
  // Y sigue siendo el mes calendario completo, e idempotente.
  assert.match(sello, /\.gte\(\s*["']fecha_ar["'],\s*desde\s*\)/);
  assert.match(sello, /\.lte\(\s*["']fecha_ar["'],\s*hasta\s*\)/);
  assert.match(sello, /\.is\(\s*["']facturado_periodo["'],\s*null\s*\)/);
});
