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
  cerrarMes,
  periodoValido,
  rangoDePeriodo,
  nombreDePeriodo,
  periodoDeHoy,
  periodoDeSemana,
  corteDePeriodo,
  mesTerminado,
  periodoASellar,
  filtroDeFacturacion,
  mesesTerminadosHaciaAtras,
  pesos,
  facturacionACSV,
  type Facturacion,
  type PuertoCierreMes,
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

test("barrido · los candidatos van del más VIEJO al más nuevo, y el más nuevo es el que toca hoy", () => {
  // El orden importa: si un mes viejo quedó sin sellar, se cierra antes que el
  // reciente (el techo por corrida recorta desde el final).
  const meses = mesesTerminadosHaciaAtras(ar("2026-11-01T04:00:00-03:00"), 4);
  assert.deepEqual(meses, ["2026-07", "2026-08", "2026-09", "2026-10"]);
  assert.equal(meses[meses.length - 1], periodoASellar(ar("2026-11-01T04:00:00-03:00")));
});

test("barrido · el mes en curso NUNCA es candidato, ni el día 1 ni el 28", () => {
  for (const dia of ["2026-11-01T04:00:00-03:00", "2026-11-28T04:00:00-03:00"]) {
    assert.ok(
      !mesesTerminadosHaciaAtras(ar(dia), 13).includes("2026-11"),
      `${dia}: noviembre está en curso`
    );
  }
});

test("barrido · cruza el año sin inventar un mes 00", () => {
  assert.deepEqual(mesesTerminadosHaciaAtras(ar("2027-01-01T04:00:00-03:00"), 3), [
    "2026-10",
    "2026-11",
    "2026-12",
  ]);
});

test("factura · un mes SELLADO se lee del sello, no del rango de fechas", () => {
  // El mes ya se facturó: la factura tiene que ser exactamente la foto que se
  // congeló. Si siguiera saliendo del rango de `fecha_ar`, una fila que apareció
  // DESPUÉS del cierre (webhook muy tardío) se sumaría sola a una factura ya
  // emitida — sin sello, sin auditoría y sin figurar en /admin/periodos.
  assert.deepEqual(filtroDeFacturacion("2026-10", true), { modo: "sellado", periodo: "2026-10" });
});

test("factura · un mes todavía abierto se lee del rango, que es lo único que hay", () => {
  assert.deepEqual(filtroDeFacturacion("2026-11", false), {
    modo: "en_vivo",
    desde: "2026-11-01",
    hasta: "2026-11-30",
  });
});

test("factura · el KPI y el CSV usan el MISMO filtro", () => {
  // No es un detalle: los dos salen de `facturacionDePeriodo`, y la
  // verificación obvia del runbook ("el CSV suma lo mismo que el panel") daría
  // OK con los dos mal si cada uno acotara por su lado.
  const detalle = cuerpoDe("facturacionDePeriodo");
  const usos = detalle.match(/filtro\.modo === "sellado"/g) ?? [];
  assert.equal(usos.length, 2, "el conteo del KPI y el detalle del CSV, los dos");
});

// ─────────────────────────────────────────────────────────────────────────────
// UN MES CERRADO NO SE VUELVE A CERRAR (el crítico del gate)
// ─────────────────────────────────────────────────────────────────────────────
// `sellarPeriodo` filtra `.is('facturado_periodo', null)`, que sobre un mes YA
// sellado es exactamente el conjunto de las filas que llegaron tarde. Sin guard,
// el segundo `cerrarMes` —un reintento "por las dudas" desde la ruta manual— las
// sellaba y las metía en una factura emitida, sin constancia de R33.
//
// Se prueba con una base de mentira detrás del puerto, que respeta las mismas
// reglas que las queries reales: sellar toca SOLO lo que está sin sello, y la
// factura de un mes sellado sale del sello (no del rango de fechas).

interface FilaFalsa {
  fecha_ar: string;
  facturable: boolean;
  sello: string | null;
}

function baseFalsa(filas: FilaFalsa[]) {
  const llamadas = { sellar: 0, faltantes: 0 };
  /** `metering_periodos_cerrados` (la 023), en un Set. */
  const marcas = new Set<string>();
  const delMes = (periodo: string) => filas.filter((f) => f.fecha_ar.slice(0, 7) === periodo);
  const conSello = (periodo: string) => filas.filter((f) => f.sello === periodo);
  const puerto: PuertoCierreMes = {
    marcar: async (periodo) => {
      marcas.add(periodo);
    },
    estaSellado: async (periodo) => marcas.has(periodo) || conSello(periodo).length > 0,
    selladas: async (periodo) => conSello(periodo).length,
    sinSellar: async (periodo) => delMes(periodo).filter((f) => f.sello === null).length,
    sellar: async (periodo) => {
      llamadas.sellar++;
      const nuevas = delMes(periodo).filter((f) => f.sello === null);
      for (const f of nuevas) f.sello = periodo;
      return nuevas.length;
    },
    // `filtroDeFacturacion` en dos líneas: mes CERRADO → la factura sale del
    // sello; mes abierto → del rango de fechas. Y "cerrado" es lo mismo que en
    // `periodoEstaSellado`: la marca o el sello de las filas — si acá se mirara
    // solo el sello, un mes cerrado en cero facturaría las tardías.
    facturables: async (periodo) => {
      const cerrado = marcas.has(periodo) || conSello(periodo).length > 0;
      const universo = cerrado ? conSello(periodo) : delMes(periodo);
      return universo.filter((f) => f.facturable).length;
    },
    faltantes: async () => {
      llamadas.faltantes++;
      return { sin_fila: 0, vivos: 0, total: 0 };
    },
  };
  return { puerto, llamadas, filas, marcas };
}

const DIA_2_DE_NOVIEMBRE = ar("2026-11-02T04:00:00-03:00");

test("cierre · el primer cierre sella el mes entero y factura lo facturable", async () => {
  const base = baseFalsa([
    { fecha_ar: "2026-10-05", facturable: true, sello: null },
    { fecha_ar: "2026-10-20", facturable: true, sello: null },
    { fecha_ar: "2026-10-31", facturable: false, sello: null }, // una ausencia
  ]);
  const r = await cerrarMes("2026-10", DIA_2_DE_NOVIEMBRE, base.puerto);
  assert.equal(r.selladas, 3, "el sello es del mes entero, no solo de lo facturable");
  assert.equal(r.selladas_total, 3);
  assert.equal(r.facturables, 2);
  assert.equal(r.ya_estaban, 0);
  assert.equal(r.tardias, 0);
});

test("cierre · la fila que llega DESPUÉS del cierre no la sella un segundo cierre", async () => {
  const base = baseFalsa([
    { fecha_ar: "2026-10-05", facturable: true, sello: null },
    { fecha_ar: "2026-10-20", facturable: true, sello: null },
    { fecha_ar: "2026-10-31", facturable: false, sello: null },
  ]);
  const primero = await cerrarMes("2026-10", DIA_2_DE_NOVIEMBRE, base.puerto);

  // Un webhook muy tardío escribe una consulta de octubre… en noviembre.
  base.filas.push({ fecha_ar: "2026-10-29", facturable: true, sello: null });

  const segundo = await cerrarMes("2026-10", ar("2026-11-08T04:00:00-03:00"), base.puerto);

  assert.equal(segundo.selladas, 0, "no toca ninguna fila");
  assert.equal(base.llamadas.sellar, 1, "el UPDATE ni se intenta la segunda vez");
  assert.equal(segundo.ya_estaban, 3);
  assert.equal(segundo.tardias, 1, "la fila tardía se INFORMA, no se sella");
  assert.equal(
    segundo.facturables,
    primero.facturables,
    "la factura emitida no se mueve: sigue diciendo 2"
  );
  assert.equal(
    base.filas.find((f) => f.fecha_ar === "2026-10-29")?.sello,
    null,
    "la tardía sigue sin sello: fuera de la factura, visible en /admin/periodos"
  );
});

test("cierre · un mes ya cerrado ni siquiera evalúa la precondición del contador", async () => {
  // Si la evaluara, un encuentro tardío todavía vivo convertiría un reintento
  // inocente en un 409 sobre un mes que ya está cerrado hace semanas.
  const base = baseFalsa([{ fecha_ar: "2026-10-05", facturable: true, sello: "2026-10" }]);
  const r = await cerrarMes("2026-10", DIA_2_DE_NOVIEMBRE, base.puerto);
  assert.equal(base.llamadas.faltantes, 0);
  assert.equal(base.llamadas.sellar, 0);
  assert.equal(r.selladas, 0);
  assert.equal(r.ya_estaban, 1);
});

test("cierre · un mes con CERO encuentros queda cerrado igual, y se nota", async () => {
  // Sin marca explícita, "cerrado en cero" y "nunca se cerró" se ven iguales:
  // no hay ninguna fila sellada que contar. El día que llega una consulta
  // tardía de ese mes, el barrido lo ve abierto y la sella — entra a la factura
  // de un mes ya cerrado. Es el crítico del gate por la puerta del mes vacío.
  const base = baseFalsa([]);
  const r = await cerrarMes("2026-10", DIA_2_DE_NOVIEMBRE, base.puerto);
  assert.equal(r.selladas, 0);
  assert.equal(r.facturables, 0);
  assert.ok(base.marcas.has("2026-10"), "el mes vacío queda MARCADO como cerrado");

  // Un mes después aparece una consulta de octubre.
  base.filas.push({ fecha_ar: "2026-10-15", facturable: true, sello: null });
  const segundo = await cerrarMes("2026-10", ar("2026-12-01T04:00:00-03:00"), base.puerto);

  assert.equal(base.llamadas.sellar, 1, "el segundo cierre no vuelve a sellar");
  assert.equal(segundo.tardias, 1, "la consulta tardía se informa…");
  assert.equal(segundo.facturables, 0, "…y la factura de octubre sigue en cero");
  assert.equal(base.filas[0].sello, null);
});

test("cierre · si el sello falla, el mes NO queda marcado como cerrado", async () => {
  // El orden es sellar → marcar, y no al revés. Un mes marcado cuyas filas no se
  // sellaron facturaría CERO teniendo encuentros: la factura de un mes cerrado
  // sale del sello. Al revés no se pierde nada — el mes sigue cerrado por sus
  // filas y la marca la escribe el barrido de mañana.
  const base = baseFalsa([{ fecha_ar: "2026-10-05", facturable: true, sello: null }]);
  const puerto = {
    ...base.puerto,
    sellar: async () => {
      throw new Error("timeout de la base");
    },
  };
  await assert.rejects(() => cerrarMes("2026-10", DIA_2_DE_NOVIEMBRE, puerto), /timeout/);
  assert.equal(base.marcas.size, 0, "ningún mes marcado sin su sello puesto");
});

test("cierre · un mes en curso no se cierra ni con la base vacía", async () => {
  const base = baseFalsa([]);
  await assert.rejects(
    () => cerrarMes("2026-11", DIA_2_DE_NOVIEMBRE, base.puerto),
    /TODAVÍA NO TERMINÓ/
  );
  assert.equal(base.llamadas.sellar, 0);
});

const SQL_023 = readFileSync(
  join(process.cwd(), "supabase/migrations-institucional/023_periodos_cerrados.sql"),
  "utf8"
);

test("023 · un mes cerrado no se reabre ni se borra", () => {
  // Si la marca se pudiera editar o borrar, "cerrado" volvería a ser una
  // opinión — y con ella volvería el mes vacío que se cierra dos veces.
  assert.match(SQL_023, /BEFORE UPDATE ON metering_periodos_cerrados/);
  assert.match(SQL_023, /BEFORE DELETE ON metering_periodos_cerrados/);
  assert.match(SQL_023, /BEFORE TRUNCATE ON metering_periodos_cerrados/);
  assert.match(
    SQL_023,
    /REVOKE TRUNCATE ON metering_periodos_cerrados FROM anon, authenticated, service_role/
  );
  assert.match(SQL_023, /ENABLE ROW LEVEL SECURITY/);
});

test("023 · es reentrante: volver a aplicarla no rompe nada", () => {
  assert.match(SQL_023, /CREATE TABLE IF NOT EXISTS metering_periodos_cerrados/);
  const triggers = SQL_023.match(/DROP TRIGGER IF EXISTS/g) ?? [];
  assert.equal(triggers.length, 3, "los tres triggers se dropean antes de crearse");
});

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
