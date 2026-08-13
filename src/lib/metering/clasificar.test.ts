// EL CASO DE TEST DEL MOCK 4 — runner: node:test + node:assert con tsx.
// Ejecutar:  npm run test:unit   (o npx tsx --test src/lib/metering/clasificar.test.ts)
//
// ── QUÉ FIJA ESTE ARCHIVO ────────────────────────────────────────────────────
// El panel que la institución va a ver en la demo (mocks/04-panel-admin.html)
// tiene números escritos a mano: 87 facturables, 9 + 2 ausencias, 98 % de
// cumplimiento. La spec (§6.6) los convirtió en un caso de test: se arma la
// semana del 19 al 25 de octubre con 98 encuentros sintéticos y su presencia de
// video, se pasa por el contador REAL, y los números tienen que salir solos.
//
// Si alguna vez este test falla, hay dos posibilidades y ninguna es "ajustar el
// número esperado": o se rompió la regla contractual, o el mock miente. Las dos
// se resuelven hablando, no editando la aserción.
//
// El detalle fino que este archivo blinda es la BOLSA DE HORAS (§6.4, decisión
// de Diego del 12/08): los turnos valen por poner la agenda, las consultas
// inmediatas valen por atender. Las dos lecturas que la discusión descartó
// —contar solo lo consumido (24,5 hs) y contar los 120 slots como disposición
// (100 %)— están escritas como aserciones NEGATIVAS: si el día de mañana
// alguien "simplifica" la regla hacia cualquiera de las dos, el test lo frena.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  reconstruirReloj,
  clasificar,
  componerFila,
  yaSePuedeClasificar,
  motorDeCanal,
  motivoIntocable,
  SEGUNDOS_FACTURABLE,
  type Clasificacion,
  type EncuentroCandidato,
  type EventoPresencia,
} from "@/lib/metering/clasificar";
import {
  aporteDelSlot,
  bloqueaElSello,
  destinoDelEncuentro,
  calcularBolsa,
  minutosAHoras,
  badgeCumplimiento,
  diasDeSemana,
  etiquetaSemana,
  semanaTerminada,
  semanaASellar,
  semanasTerminadasHaciaAtras,
  semanaDeHoy,
  semanaAnterior,
  semanaSiguiente,
  correrDias,
  diaARdeConsulta,
  cerrarSemana,
  cumplimientoDeSemana,
  cumplimientoSaleDeLoSellado,
  filasDeLoSellado,
  totalDeBolsa,
  corridaDelBarrido,
  semanasDeLaCorrida,
  SEMANAS_POR_CORRIDA,
  type CumplimientoProfesional,
  type PuertoCierreSemana,
  type PuertoSemanaSellada,
} from "@/lib/metering/bolsa";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE — la semana del 19 al 25 de octubre (mock 4)
// ─────────────────────────────────────────────────────────────────────────────

const LUNES = "2026-10-19"; // lunes AR
const DURACION_SLOT_MIN = 15;
/** Precio por consulta del acuerdo, en centavos ($15.000). Viaja en cada fila. */
const PRECIO_CONSULTA_CENTAVOS = 1_500_000;

/** Instante AR de una hora de un día de la semana del fixture. */
function instante(diaOffset: number, hhmm: string, segundos = 0): string {
  const d = new Date(`${LUNES}T00:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + diaOffset);
  const [h, m] = hhmm.split(":").map(Number);
  d.setUTCHours(d.getUTCHours() + h, d.getUTCMinutes() + m, segundos, 0);
  return d.toISOString();
}

/** Presencia sintética: el profesional entra, el paciente entra, se van. */
function presencia(params: {
  entradaMedicoISO: string;
  entradaPacienteISO: string;
  segundosJuntos: number;
}): EventoPresencia[] {
  const finMs = Date.parse(params.entradaPacienteISO) + params.segundosJuntos * 1000;
  const fin = new Date(finMs).toISOString();
  return [
    { rol: "medico", identity: "medico-x", evento: "joined", ocurrido_at: params.entradaMedicoISO },
    { rol: "paciente", identity: "paciente-y", evento: "joined", ocurrido_at: params.entradaPacienteISO },
    { rol: "paciente", identity: "paciente-y", evento: "left", ocurrido_at: fin },
    { rol: "medico", identity: "medico-x", evento: "left", ocurrido_at: fin },
  ];
}

interface EncuentroFixture {
  encuentro: EncuentroCandidato;
  eventos: EventoPresencia[];
  documentos: number;
}

/**
 * Los 98 encuentros terminales de la semana + los 22 slots libres que NO
 * generan fila. La distribución por día calca el chart del mock (16/15/14/15/
 * 17/6/4 facturables), pero lo que el test verifica son los TOTALES: el reparto
 * por día es decorado del fixture, no una regla del negocio.
 */
function armarFixture(): { encuentros: EncuentroFixture[]; slotsLibres: number } {
  const encuentros: EncuentroFixture[] = [];
  let n = 0;

  const nuevo = (params: {
    tipo: "consulta" | "turno";
    canal: string;
    estado: string;
    dia: number;
    segundosJuntos: number;
    documentos?: number;
  }): void => {
    n++;
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const hora = `${8 + (n % 8)}:00`;
    const inicio = instante(params.dia, hora);
    const cierre = new Date(Date.parse(inicio) + DURACION_SLOT_MIN * 60_000).toISOString();
    encuentros.push({
      encuentro: {
        tipo: params.tipo,
        id,
        estado: params.estado,
        canal_origen: params.canal,
        medico_id: `medico-${n % 30}`,
        paciente_id: `paciente-${n}`,
        ocurridoISO: inicio,
        cierreISO: cierre,
      },
      eventos:
        params.segundosJuntos > 0
          ? presencia({
              entradaMedicoISO: inicio,
              entradaPacienteISO: new Date(Date.parse(inicio) + 5000).toISOString(),
              segundosJuntos: params.segundosJuntos,
            })
          : [],
      documentos: params.documentos ?? 0,
    });
  };

  // 61 turnos del motor ACORDADO, completados, ambos ≥60 s.
  for (let i = 0; i < 61; i++) {
    nuevo({ tipo: "turno", canal: "acordado", estado: "completado", dia: i % 7, segundosJuntos: 600 });
  }
  // 12 turnos del motor OFRECIDO, completados, ambos ≥60 s.
  for (let i = 0; i < 12; i++) {
    nuevo({ tipo: "turno", canal: "ofrecido", estado: "completado", dia: i % 7, segundosJuntos: 480 });
  }
  // 14 consultas inmediatas (ESPONTÁNEO): 10 facturan por reloj…
  for (let i = 0; i < 10; i++) {
    nuevo({ tipo: "consulta", canal: "espontaneo", estado: "completada", dia: i % 7, segundosJuntos: 300 });
  }
  // …y 4 facturan por DOCUMENTO EMITIDO, con el reloj por debajo del umbral.
  // Es la mitad "y/o" de la regla contractual: la consulta corta que igual dejó
  // una receta se factura.
  for (let i = 0; i < 4; i++) {
    nuevo({
      tipo: "consulta",
      canal: "espontaneo",
      estado: "completada",
      dia: i % 7,
      segundosJuntos: 40,
      documentos: 1,
    });
  }
  // 9 turnos con ausencia del paciente (se informan, no se facturan).
  for (let i = 0; i < 9; i++) {
    nuevo({ tipo: "turno", canal: "acordado", estado: "ausente_paciente", dia: i % 7, segundosJuntos: 0 });
  }
  // 2 turnos con ausencia del profesional (no se facturan y DESCUENTAN horas).
  for (let i = 0; i < 2; i++) {
    nuevo({ tipo: "turno", canal: "acordado", estado: "ausente_medico", dia: i % 7, segundosJuntos: 0 });
  }

  // 22 slots libres transcurridos: existen en la agenda, no generan encuentro.
  return { encuentros, slotsLibres: 22 };
}

function contarPor<T extends string>(valores: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of valores) out[v] = (out[v] ?? 0) + 1;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL CONTADOR — aserciones del mock 4
// ─────────────────────────────────────────────────────────────────────────────

const { encuentros, slotsLibres } = armarFixture();
const filas = encuentros.map((f) => {
  const fila = componerFila({
    encuentro: f.encuentro,
    eventos: f.eventos,
    documentosEmitidos: f.documentos,
    especialidad: "Clínica Médica",
    precioCentavos: PRECIO_CONSULTA_CENTAVOS,
  });
  assert.ok(fila, `el encuentro ${f.encuentro.id} tiene que producir fila`);
  return fila;
});

test("mock 4 · el fixture son 98 encuentros terminales (los 22 slots libres NO generan fila)", () => {
  assert.equal(encuentros.length, 98);
  assert.equal(filas.length, 98);
  assert.equal(slotsLibres, 22);
});

test("mock 4 · 87 facturables, con el desglose por motor del gráfico", () => {
  const facturables = filas.filter((f) => f.clasificacion === "facturable");
  assert.equal(facturables.length, 87);
  assert.deepEqual(contarPor(facturables.map((f) => f.motor)), {
    acordado: 61,
    espontaneo: 14,
    ofrecido: 12,
  });
});

test("mock 4 · las ausencias: 9 de pacientes y 2 de profesionales, ninguna facturable", () => {
  const porClase = contarPor(filas.map((f) => f.clasificacion));
  assert.equal(porClase["ausente_paciente"], 9);
  assert.equal(porClase["ausente_profesional"], 2);
  // 87 + 9 + 2 = 98: no queda ni un encuentro sin clasificar ni uno de más.
  assert.equal(porClase["facturable"] + porClase["ausente_paciente"] + porClase["ausente_profesional"], 98);
  assert.equal(porClase["no_facturable_corta"], undefined);
  assert.equal(porClase["falla_tecnica"], undefined);
});

test("mock 4 · 4 de las 14 consultas facturan por documento, con el reloj por debajo de 60 s", () => {
  const porDocumento = filas.filter(
    (f) => f.clasificacion === "facturable" && f.segundos_ambos_en_sala < SEGUNDOS_FACTURABLE
  );
  assert.equal(porDocumento.length, 4);
  for (const f of porDocumento) assert.equal(f.documentos_emitidos, 1);
});

test("mock 4 · el KPI 'sin asignar' se calcula contra la OFERTA de slots, no contra el contador", () => {
  // 120 slot-equivalentes de la semana − 98 encuentros = 22 libres. Los 22 no
  // existen como filas: preguntarle al contador cuántos slots quedaron vacíos
  // sería preguntarle a la factura por lo que no se hizo.
  const slotEquivalentes = 120;
  assert.equal(slotEquivalentes - filas.length, 22);
});

test("mock 4 · el precio viaja EN la fila (la factura de un mes cerrado no se reescribe)", () => {
  // El precio vive en el config y cambia. Si la factura se calculara con el
  // vigente, el CSV de octubre bajado en enero diría otro total con las mismas
  // líneas. Por eso cada encuentro se lleva el suyo puesto.
  for (const f of filas) assert.equal(f.precio_centavos, PRECIO_CONSULTA_CENTAVOS);
  const facturables = filas.filter((f) => f.clasificacion === "facturable");
  assert.equal(
    facturables.reduce((s, f) => s + f.precio_centavos, 0),
    87 * PRECIO_CONSULTA_CENTAVOS
  );
});

test("mock 4 · en el contador no existe ningún concepto de Mercado Pago", () => {
  const claves = Object.keys(filas[0]);
  assert.equal(
    claves.some((k) => k.startsWith("mp_") || k.includes("pago") || k.includes("monto")),
    false,
    `columnas del contador: ${claves.join(", ")}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// LA BOLSA DE HORAS — la regla híbrida (§6.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La agenda del fixture: 106 huecos de agenda (61 acordados + 12 ofrecidos + 9
 * con ausencia del paciente + 2 con ausencia del profesional + 22 libres) que
 * ya transcurrieron, más 14 consultas inmediatas que no ocupan agenda.
 *
 * Los 30 profesionales se cuentan juntos, como los mira el KPI del panel: la
 * `clave` de cada hueco lo mantiene separado del de al lado.
 */
const AGENDA_SLOTS = 61 + 12 + 9 + 2 + 22; // 106
const CI_FACTURABLES = 14;
const HORAS_COMPROMETIDAS = 30; // 30 profesionales × 1 h

const hueco = (i: number, hora: string, descuenta: boolean) => {
  const medicoId = `medico-${i % 30}`;
  return {
    clave: `${medicoId}|slot-${i}|${hora}`,
    medicoId,
    inicioMs: Date.parse(instante(i % 7, hora)),
    finMs: Date.parse(instante(i % 7, hora)) + DURACION_SLOT_MIN * 60_000,
    descuenta,
  };
};

const bolsa = calcularBolsa({
  duracionSlotMin: DURACION_SLOT_MIN,
  horasComprometidas: HORAS_COMPROMETIDAS,
  slots: [
    ...Array.from({ length: AGENDA_SLOTS - 2 }, (_, i) => hueco(i, "09:00", false)),
    // Los dos slots donde faltó el profesional: descuentan.
    ...Array.from({ length: 2 }, (_, i) => hueco(1000 + i, "18:00", true)),
  ],
  // Las 14 CI caen fuera de toda franja propia (14:00; las franjas del fixture
  // están a las 09:00 y a las 18:00): suman bloque completo.
  cis: Array.from({ length: CI_FACTURABLES }, (_, i) => ({
    medicoId: `medico-${i % 30}`,
    inicioMs: Date.parse(instante(i % 7, "14:00")),
  })),
});

test("bolsa · los turnos valen por DISPOSICIÓN: (106 − 2) × 15 min = 26 hs", () => {
  assert.equal(bolsa.slotsContados, AGENDA_SLOTS - 2);
  assert.equal(bolsa.slotsDescontados, 2);
  assert.equal(bolsa.minutosTurnos, (AGENDA_SLOTS - 2) * DURACION_SLOT_MIN);
  assert.equal(minutosAHoras(bolsa.minutosTurnos), 26);
});

test("bolsa · las consultas inmediatas valen por ATENCIÓN: 14 bloques de 15 min = 3,5 hs", () => {
  assert.equal(bolsa.cisContadas, CI_FACTURABLES);
  assert.equal(bolsa.minutosCI, CI_FACTURABLES * DURACION_SLOT_MIN);
  assert.equal(minutosAHoras(bolsa.minutosCI), 3.5);
});

test("bolsa · 29,5 de 30 horas = 98 % (el número del mock 4)", () => {
  assert.equal(minutosAHoras(bolsa.minutosCumplidos), 29.5);
  assert.equal(minutosAHoras(bolsa.minutosComprometidos), 30);
  assert.equal(bolsa.porcentaje, 98);
});

test("bolsa · la lectura CONSUMO (24,5 hs) está RECHAZADA", () => {
  // Consumo = contar los 98 encuentros atendidos × 15 min. Es la lectura que
  // castiga al profesional por una agenda que la institución no llenó.
  const consumo = 98 * DURACION_SLOT_MIN;
  assert.equal(minutosAHoras(consumo), 24.5);
  assert.notEqual(bolsa.minutosCumplidos, consumo);
});

test("bolsa · la lectura DISPOSICIÓN-sobre-120 (100 %) está RECHAZADA", () => {
  // Contar los 120 slot-equivalentes como disposición daría 30 de 30 = 100 %:
  // le regalaría al profesional las dos horas donde no apareció.
  const disposicionSobre120 = 120 * DURACION_SLOT_MIN;
  assert.equal(minutosAHoras(disposicionSobre120), 30);
  assert.notEqual(bolsa.minutosCumplidos, disposicionSobre120);
  assert.notEqual(bolsa.porcentaje, 100);
});

test("bolsa · un slot que la institución bloqueó no suma ni descuenta", () => {
  // `desactivarAgenda` pasa a `bloqueado` todos los slots disponibles del
  // modelo. Ese hueco no es una hora puesta a disposición (nadie podía tomar
  // turno) ni una ausencia del profesional (la baja no la decidió él).
  assert.equal(aporteDelSlot("bloqueado"), "ignora");
  assert.equal(aporteDelSlot("disponible"), "cuenta");
  assert.equal(aporteDelSlot("completado"), "cuenta");
  assert.equal(aporteDelSlot("cancelado_paciente"), "cuenta");
  assert.equal(aporteDelSlot("ausente_medico"), "descuenta");
  assert.equal(aporteDelSlot("cancelado_medico"), "descuenta");
});

test("bolsa · la tabla de aportes es EXHAUSTIVA: un estado desconocido revienta", () => {
  // Hallazgo S2 del gate #405. Antes el default era "cuenta": un estado nuevo
  // —o uno viejo que nadie recordaba— entraba SUMANDO horas de cumplimiento
  // sin que nadie lo decidiera, en una tabla que se sella y no se recalcula.
  // Ahora el default no existe.
  assert.throws(() => aporteDelSlot("modo_guardia"), /Estado de turno desconocido/);
  assert.throws(() => aporteDelSlot(""), /Estado de turno desconocido/);

  // Y los estados que SÍ existen están todos, con su decisión escrita: la
  // lista sale del CHECK vivo de `turnos`.
  const DEL_CHECK = [
    "disponible", "reservado_pendiente", "confirmado", "en_espera", "en_curso",
    "completado", "ausente_paciente", "ausente_medico", "cancelado_paciente",
    "cancelado_medico", "reprogramado", "bloqueado", "bloqueado_sin_cobro",
  ];
  for (const estado of DEL_CHECK) {
    assert.doesNotThrow(() => aporteDelSlot(estado), `falta decidir qué hace "${estado}"`);
  }

  // El turno MOVIDO es neutro. Era "cuenta" ("el hueco existió igual"), cierto
  // cuando el hueco lo mueve la institución — pero el motor masivo escribe
  // `reprogramado` en el caso contrario: el profesional avisó que NO atiende
  // ese día. Acreditárselo convertía un descuento en un crédito. Y el encuentro
  // real es el turno nuevo, que ya le cuenta a quien lo recibe: si además
  // contara en el origen, la misma hora se acreditaría a dos profesionales
  // distintos (la dedup por `clave` no lo agarra: la clave lleva el medicoId).
  assert.equal(aporteDelSlot("reprogramado"), "ignora");
  // La baja de agenda que decide la INSTITUCIÓN es neutra, con cobro o sin él.
  assert.equal(aporteDelSlot("bloqueado_sin_cobro"), "ignora");
});

test("bolsa · una CI atendida DENTRO de una franja propia ya transcurrida no suma dos veces", () => {
  const inicio = Date.parse(instante(0, "09:00"));
  const r = calcularBolsa({
    duracionSlotMin: 15,
    horasComprometidas: 1,
    slots: [{ clave: "m1|d1|09:00", medicoId: "m1", inicioMs: inicio, finMs: inicio + 15 * 60_000, descuenta: false }],
    cis: [{ medicoId: "m1", inicioMs: inicio + 3 * 60_000 }], // adentro de su propia franja
  });
  assert.equal(r.minutosTurnos, 15);
  assert.equal(r.minutosCI, 0, "esa hora ya está contada por disposición");
  assert.equal(r.cisDentroDeFranja, 1);
  assert.equal(r.minutosCumplidos, 15);
});

test("bolsa · la CI de un profesional NO se tapa con la franja de OTRO", () => {
  const inicio = Date.parse(instante(0, "09:00"));
  const r = calcularBolsa({
    duracionSlotMin: 15,
    horasComprometidas: 1,
    slots: [{ clave: "m1|d1|09:00", medicoId: "m1", inicioMs: inicio, finMs: inicio + 15 * 60_000, descuenta: false }],
    cis: [{ medicoId: "m2", inicioMs: inicio + 3 * 60_000 }],
  });
  assert.equal(r.cisContadas, 1);
  assert.equal(r.minutosCI, 15);
});

test("bolsa · el mismo hueco levantado dos veces (turno reprogramado) cuenta UNA sola vez", () => {
  // Un turno reprogramado queda como fila terminal Y su horario vuelve a la
  // oferta como slot disponible: son dos filas y una sola hora de agenda.
  const inicio = Date.parse(instante(0, "10:00"));
  const fila = { clave: "m1|d1|10:00", medicoId: "m1", inicioMs: inicio, finMs: inicio + 15 * 60_000, descuenta: false };
  const r = calcularBolsa({ duracionSlotMin: 15, horasComprometidas: 1, slots: [fila, { ...fila }], cis: [] });
  assert.equal(r.slotsContados, 1);
  assert.equal(r.minutosTurnos, 15);
});

test("bolsa · si UNA de las filas del hueco es ausencia del profesional, el hueco descuenta", () => {
  const inicio = Date.parse(instante(0, "11:00"));
  const base = { clave: "m1|d1|11:00", medicoId: "m1", inicioMs: inicio, finMs: inicio + 15 * 60_000 };
  const r = calcularBolsa({
    duracionSlotMin: 15,
    horasComprometidas: 1,
    slots: [{ ...base, descuenta: false }, { ...base, descuenta: true }],
    cis: [],
  });
  assert.equal(r.slotsContados, 0);
  assert.equal(r.slotsDescontados, 1);
  assert.equal(r.minutosTurnos, 0);
});

test("bolsa · los minutos del turno salen de la duración REAL del slot, no del config", () => {
  // Agenda vieja de 20 min con el config ya en 15: lo que puso a disposición
  // fueron 20 minutos. El config manda en el bloque de la CI, no acá.
  const inicio = Date.parse(instante(0, "12:00"));
  const r = calcularBolsa({
    duracionSlotMin: 15,
    horasComprometidas: 1,
    slots: [{ clave: "m1|d1|12:00", medicoId: "m1", inicioMs: inicio, finMs: inicio + 20 * 60_000, descuenta: false }],
    cis: [],
  });
  assert.equal(r.minutosTurnos, 20);
});

test("bolsa · sin agenda ni consultas, el profesional queda en 0 % (nunca en NaN)", () => {
  const r = calcularBolsa({ duracionSlotMin: 15, horasComprometidas: 1, slots: [], cis: [] });
  assert.equal(r.minutosCumplidos, 0);
  assert.equal(r.porcentaje, 0);
});

test("bolsa · sin acuerdo cargado (0 horas) el porcentaje no divide por cero", () => {
  const inicio = Date.parse(instante(0, "09:00"));
  const r = calcularBolsa({
    duracionSlotMin: 15,
    horasComprometidas: 0,
    slots: [{ clave: "m1|d1|09:00", medicoId: "m1", inicioMs: inicio, finMs: inicio + 15 * 60_000, descuenta: false }],
    cis: [],
  });
  assert.equal(r.porcentaje, 0);
  assert.equal(Number.isFinite(r.porcentaje), true);
});

// ── R30: la semana en curso no marca a nadie como incompleto ─────────────────

test("badge · un miércoles nadie figura 'Incompleto' — figura 'En curso'", () => {
  assert.equal(badgeCumplimiento(15, 60, false), "En curso");
  assert.equal(badgeCumplimiento(15, 60, true), "Incompleto");
});

test("badge · cumplido es cumplido, esté la semana abierta o cerrada", () => {
  assert.equal(badgeCumplimiento(60, 60, false), "Cumplido");
  assert.equal(badgeCumplimiento(75, 60, true), "Cumplido");
});

test("badge · sin un solo minuto, 'Sin actividad' (y nunca 'Incompleto' en curso)", () => {
  assert.equal(badgeCumplimiento(0, 60, false), "Sin actividad");
  assert.equal(badgeCumplimiento(0, 60, true), "Sin actividad");
});

// ── La semana AR ─────────────────────────────────────────────────────────────

test("semana · el 19 al 25 de octubre es de lunes a domingo", () => {
  assert.deepEqual(diasDeSemana(LUNES), [
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
    "2026-10-24",
    "2026-10-25",
  ]);
  assert.equal(etiquetaSemana(LUNES), "19 al 25 de octubre");
});

test("semana · una semana a caballo de dos meses se nombra con los dos", () => {
  assert.equal(etiquetaSemana("2026-10-26"), "26 de octubre al 1 de noviembre");
});

test("semana · terminada = pasó el domingo a medianoche AR, no antes", () => {
  assert.equal(semanaTerminada(LUNES, Date.parse("2026-10-25T20:00:00-03:00")), false);
  assert.equal(semanaTerminada(LUNES, Date.parse("2026-10-26T00:30:00-03:00")), true);
});

test("semana · la EN CURSO y las FUTURAS no están terminadas: son las que no se pueden sellar", () => {
  // Es la precondición cero de `cerrarSemana` y el 422 del endpoint manual.
  // `encuentrosSinClasificar` NO la cubre: un martes a la noche da total=0
  // porque no hay nada vivo, y `cumplimientoDeSemana` solo cuenta lo
  // transcurrido — se sellaría un día y medio como si fuera la semana entera,
  // en una tabla inmutable, sobre el número que se le factura a la institución.
  const martesALaNoche = Date.parse("2026-10-20T23:00:00-03:00");
  assert.equal(semanaTerminada(LUNES, martesALaNoche), false, "la semana EN CURSO");
  assert.equal(semanaTerminada("2026-10-26", martesALaNoche), false, "la semana que viene");
  assert.equal(semanaTerminada("2026-11-30", martesALaNoche), false, "un lunes lejano");
  // Y la anterior sí, que es la que el runbook manda sellar.
  assert.equal(semanaTerminada("2026-10-12", martesALaNoche), true);
  assert.equal(semanaASellar(martesALaNoche), "2026-10-12");
});

test("semana · el cron del lunes sella la que acaba de terminar, no la que arranca", () => {
  // Lunes 26 a las 02:00 ART (el horario del cron): la semana a sellar es la
  // del 19. Corría a las 00:05, antes de que el contador terminara de clasificar
  // el domingo a la noche — y el sello congela lo que el contador escribió.
  assert.equal(semanaASellar(Date.parse("2026-10-26T02:00:00-03:00")), LUNES);
  assert.equal(semanaDeHoy(Date.parse("2026-10-26T02:00:00-03:00")), "2026-10-26");
  // Y sigue valiendo en la ventana vieja, por si alguna vez se corre a mano.
  assert.equal(semanaASellar(Date.parse("2026-10-26T00:05:00-03:00")), LUNES);
});

test("barrido semanal · las candidatas van de la más VIEJA a la más nueva, y la última es la que toca hoy", () => {
  // El orden importa: si una semana vieja quedó sin sellar, se atiende antes
  // que la reciente — con el matiz de `semanasDeLaCorrida`, que igual le
  // reserva un lugar a la más nueva. Es el espejo de
  // `mesesTerminadosHaciaAtras`.
  const martes = Date.parse("2026-10-20T04:00:00-03:00");
  assert.deepEqual(semanasTerminadasHaciaAtras(martes, 4), [
    "2026-09-21",
    "2026-09-28",
    "2026-10-05",
    "2026-10-12",
  ]);
  assert.equal(
    semanasTerminadasHaciaAtras(martes, 4).at(-1),
    semanaASellar(martes),
    "la última candidata es la que el cron sellaría hoy"
  );
});

test("barrido semanal · la semana EN CURSO nunca es candidata, ningún día", () => {
  for (const dia of ["2026-10-19T04:00:00-03:00", "2026-10-25T23:00:00-03:00"]) {
    const candidatas = semanasTerminadasHaciaAtras(Date.parse(dia), 8);
    assert.ok(!candidatas.includes("2026-10-19"), `${dia}: la del 19 está en curso`);
    for (const semana of candidatas) {
      assert.equal(semanaTerminada(semana, Date.parse(dia)), true, `${semana} tiene que estar terminada`);
    }
  }
});

test("barrido semanal · cruza el año sin inventar una semana rara", () => {
  // Todas las candidatas son LUNES, también del otro lado del 1 de enero.
  const enero = Date.parse("2027-01-06T04:00:00-03:00");
  for (const semana of semanasTerminadasHaciaAtras(enero, 8)) {
    assert.equal(new Date(`${semana}T12:00:00Z`).getUTCDay(), 1, `${semana} tiene que ser lunes`);
  }
  assert.deepEqual(semanasTerminadasHaciaAtras(enero, 2), ["2026-12-21", "2026-12-28"]);
});

test("semana · el selector avanza y retrocede de a siete días", () => {
  assert.equal(semanaAnterior(LUNES), "2026-10-12");
  assert.equal(semanaSiguiente(LUNES), "2026-10-26");
});

// ─────────────────────────────────────────────────────────────────────────────
// LOS BORDES (§6.6) — donde el reloj se rompe
// ─────────────────────────────────────────────────────────────────────────────

test("borde · un 'joined' duplicado (reintento del webhook) no infla los segundos", () => {
  const base = instante(0, "10:00");
  const conDuplicado = reconstruirReloj(
    [
      { rol: "medico", identity: "medico-1", evento: "joined", ocurrido_at: base, evento_id: "ev-1" },
      { rol: "medico", identity: "medico-1", evento: "joined", ocurrido_at: base, evento_id: "ev-1" },
      { rol: "paciente", identity: "pac-1", evento: "joined", ocurrido_at: instante(0, "10:01") },
      { rol: "paciente", identity: "pac-1", evento: "left", ocurrido_at: instante(0, "10:04") },
      { rol: "medico", identity: "medico-1", evento: "left", ocurrido_at: instante(0, "10:05") },
    ],
    null
  );
  assert.equal(conDuplicado.segundosAmbosEnSala, 180);
  assert.equal(conDuplicado.intervalos.length, 1);
});

test("borde · un 'joined' repetido SIN id de evento tampoco duplica (la identidad ya estaba adentro)", () => {
  const r = reconstruirReloj(
    [
      { rol: "medico", identity: "medico-1", evento: "joined", ocurrido_at: instante(0, "10:00") },
      { rol: "paciente", identity: "pac-1", evento: "joined", ocurrido_at: instante(0, "10:00") },
      { rol: "paciente", identity: "pac-1", evento: "joined", ocurrido_at: instante(0, "10:02") },
      { rol: "paciente", identity: "pac-1", evento: "left", ocurrido_at: instante(0, "10:03") },
    ],
    null
  );
  assert.equal(r.segundosAmbosEnSala, 180);
  assert.equal(r.intervalos.length, 1);
});

test("borde · si falta el 'left', el intervalo se cierra en completada_at", () => {
  const r = reconstruirReloj(
    [
      { rol: "medico", identity: "medico-1", evento: "joined", ocurrido_at: instante(0, "10:00") },
      { rol: "paciente", identity: "pac-1", evento: "joined", ocurrido_at: instante(0, "10:00") },
    ],
    instante(0, "10:12")
  );
  assert.equal(r.segundosAmbosEnSala, 720);
});

test("borde · sin 'left' y sin cierre, el reloj NO corre hasta hoy", () => {
  const r = reconstruirReloj(
    [
      { rol: "medico", identity: "medico-1", evento: "joined", ocurrido_at: instante(0, "10:00") },
      { rol: "paciente", identity: "pac-1", evento: "joined", ocurrido_at: instante(0, "10:00") },
    ],
    null
  );
  assert.equal(r.segundosAmbosEnSala, 0);
});

test("borde · el profesional con dos dispositivos sigue presente hasta que se van los dos", () => {
  const r = reconstruirReloj(
    [
      { rol: "medico", identity: "medico-1-tel", evento: "joined", ocurrido_at: instante(0, "10:00") },
      { rol: "medico", identity: "medico-1-pc", evento: "joined", ocurrido_at: instante(0, "10:01") },
      { rol: "paciente", identity: "pac-1", evento: "joined", ocurrido_at: instante(0, "10:01") },
      { rol: "medico", identity: "medico-1-tel", evento: "left", ocurrido_at: instante(0, "10:02") },
      { rol: "paciente", identity: "pac-1", evento: "left", ocurrido_at: instante(0, "10:05") },
    ],
    null
  );
  assert.equal(r.segundosAmbosEnSala, 240);
});

test("borde · una reconexión no le come segundos al reloj (se redondea una vez, al final)", () => {
  // El paciente pierde señal y vuelve: dos tramos de 30,9 s = 61,8 s reales.
  // Redondeando por tramo daban 30 + 30 = 60; con 29,9 + 30,9 (60,8 s reales)
  // daban 59 y la consulta caía en `no_facturable_corta`. En un celular esto no
  // es un borde raro: es el lunes a la mañana.
  const t0 = Date.parse(instante(0, "10:00"));
  const eventos: EventoPresencia[] = [
    { rol: "medico", identity: "m", evento: "joined", ocurrido_at: new Date(t0).toISOString() },
    { rol: "paciente", identity: "p", evento: "joined", ocurrido_at: new Date(t0).toISOString() },
    { rol: "paciente", identity: "p", evento: "left", ocurrido_at: new Date(t0 + 29_900).toISOString() },
    { rol: "paciente", identity: "p", evento: "joined", ocurrido_at: new Date(t0 + 40_000).toISOString() },
    { rol: "paciente", identity: "p", evento: "left", ocurrido_at: new Date(t0 + 70_900).toISOString() },
    { rol: "medico", identity: "m", evento: "left", ocurrido_at: new Date(t0 + 70_900).toISOString() },
  ];
  const reloj = reconstruirReloj(eventos, null);
  assert.equal(reloj.intervalos.length, 2);
  assert.equal(reloj.segundosAmbosEnSala, 60); // 29,9 + 30,9 = 60,8 s
  assert.equal(
    clasificar({ estado: "completada", segundosAmbosEnSala: reloj.segundosAmbosEnSala, documentosEmitidos: 0 }),
    "facturable"
  );
});

test("borde · ambos entraron menos de 60 s y sin documento → no_facturable_corta", () => {
  assert.equal(
    clasificar({ estado: "completado", segundosAmbosEnSala: 42, documentosEmitidos: 0 }),
    "no_facturable_corta"
  );
});

test("borde · el override 'falla_tecnica' gana sobre un encuentro de 10 minutos", () => {
  const c: Clasificacion = clasificar({
    estado: "completado",
    segundosAmbosEnSala: 600,
    documentosEmitidos: 2,
    overrideManual: "falla_tecnica",
  });
  assert.equal(c, "falla_tecnica");
});

// El `overrideManual` de arriba es la mitad de la regla que todavía no tiene
// caller (la va a usar el /admin interno). La que SÍ corre en producción es
// esta: el job pregunta fila por fila si puede tocarla. Sin este test, la
// protección que de verdad defiende la declaración de un humano no tenía
// ninguna — y su modo de falla es mudo: el job pisa la fila y sigue.
test("borde · el job NO toca una fila que fijó un humano, ni una ya facturada", () => {
  assert.equal(motivoIntocable({ clasificacion_origen: "manual_admin" }), "manual");
  assert.equal(motivoIntocable({ facturado_periodo: "2026-10" }), "sellada");
  // Sellada gana sobre manual: las dos frenan, pero el resumen del cron las
  // cuenta por separado y una fila facturada es la razón más fuerte.
  assert.equal(
    motivoIntocable({ clasificacion_origen: "manual_admin", facturado_periodo: "2026-10" }),
    "sellada"
  );
});

test("cinturón · componerFila se niega a componer el reemplazo de una fila intocable", () => {
  // Hallazgo S5 del gate #405. El filtro de `intocables` del job es el tirante;
  // esto es el cinturón, para el caller que venga después (un backfill, un
  // /admin, un script de corrección) y no lo replique. Sin esto, esa fila sale
  // compuesta con `clasificacion_origen: 'job'`, lista para pisar la
  // declaración de un humano o una fila ya facturada.
  const encuentro = {
    tipo: "turno" as const,
    id: "00000000-0000-4000-8000-000000000997",
    estado: "completado",
    canal_origen: "acordado",
    medico_id: "m",
    paciente_id: "p",
    ocurridoISO: instante(0, "10:00"),
    cierreISO: instante(0, "10:15"),
  };
  const base = {
    encuentro,
    eventos: [],
    documentosEmitidos: 1,
    especialidad: null,
    precioCentavos: PRECIO_CONSULTA_CENTAVOS,
  };
  assert.equal(componerFila({ ...base, filaPrevia: { clasificacion_origen: "manual_admin" } }), null);
  assert.equal(componerFila({ ...base, filaPrevia: { facturado_periodo: "2026-10" } }), null);
  // Una fila común del job sí se recompone: el webhook puede llegar tarde.
  assert.ok(componerFila({ ...base, filaPrevia: { clasificacion_origen: "job" } }));
  assert.ok(componerFila({ ...base, filaPrevia: null }));
  assert.ok(componerFila(base));
});

test("borde · una fila común del job SÍ se reclasifica (el webhook puede llegar tarde)", () => {
  assert.equal(motivoIntocable({ clasificacion_origen: "job", facturado_periodo: null }), null);
  assert.equal(motivoIntocable({}), null);
});

test("borde · una ausencia declarada gana sobre el reloj", () => {
  assert.equal(
    clasificar({ estado: "ausente_paciente", segundosAmbosEnSala: 900, documentosEmitidos: 1 }),
    "ausente_paciente"
  );
  assert.equal(
    clasificar({ estado: "ausente_medico", segundosAmbosEnSala: 900, documentosEmitidos: 0 }),
    "ausente_profesional"
  );
});

test("borde · la CI usa los estados de su canal (no_show_paciente / medico_ausente)", () => {
  assert.equal(
    clasificar({ estado: "no_show_paciente", segundosAmbosEnSala: 0, documentosEmitidos: 0 }),
    "ausente_paciente"
  );
  assert.equal(
    clasificar({ estado: "medico_ausente", segundosAmbosEnSala: 0, documentosEmitidos: 0 }),
    "ausente_profesional"
  );
});

test("borde · exactamente 60 segundos factura (el umbral es inclusivo, como dice el contrato)", () => {
  assert.equal(clasificar({ estado: "completado", segundosAmbosEnSala: 60, documentosEmitidos: 0 }), "facturable");
  assert.equal(
    clasificar({ estado: "completado", segundosAmbosEnSala: 59, documentosEmitidos: 0 }),
    "no_facturable_corta"
  );
});

test("borde · no se clasifica antes de los 15 minutos del cierre (el borrador puede emitir después)", () => {
  const cierre = instante(0, "10:00");
  const cierreMs = Date.parse(cierre);
  assert.equal(yaSePuedeClasificar(cierre, cierreMs + 5 * 60_000), false);
  assert.equal(yaSePuedeClasificar(cierre, cierreMs + 15 * 60_000), true);
  // Sin cierre conocido no hay borrador que esperar.
  assert.equal(yaSePuedeClasificar(null, cierreMs), true);
});

test("borde · un canal_origen desconocido NO produce fila (no se inventa un motor)", () => {
  assert.equal(motorDeCanal("clinica_virtual"), null);
  assert.equal(motorDeCanal(null), null);
  const fila = componerFila({
    encuentro: {
      tipo: "turno",
      id: "00000000-0000-4000-8000-000000000999",
      estado: "completado",
      canal_origen: "consultorio_privado",
      medico_id: "m",
      paciente_id: "p",
      ocurridoISO: instante(0, "10:00"),
      cierreISO: instante(0, "10:15"),
    },
    eventos: [],
    documentosEmitidos: 0,
    especialidad: null,
    precioCentavos: PRECIO_CONSULTA_CENTAVOS,
  });
  assert.equal(fila, null);
});

test("la semana AR del encuentro es la del lunes 19, también para el domingo 25", () => {
  const domingo = componerFila({
    encuentro: {
      tipo: "turno",
      id: "00000000-0000-4000-8000-000000000998",
      estado: "completado",
      canal_origen: "acordado",
      medico_id: "m",
      paciente_id: "p",
      ocurridoISO: instante(6, "21:30"), // domingo 25, 21:30 AR
      cierreISO: instante(6, "21:45"),
    },
    eventos: [],
    documentosEmitidos: 1,
    especialidad: null,
    precioCentavos: PRECIO_CONSULTA_CENTAVOS,
  });
  assert.ok(domingo);
  assert.equal(domingo.semana_ar, LUNES);
  assert.equal(domingo.fecha_ar, "2026-10-25");
});

// ─────────────────────────────────────────────────────────────────────────────
// LA PRECONDICIÓN DEL SELLO (I1 del gate #405) — qué bloquea y qué no
// ─────────────────────────────────────────────────────────────────────────────
//
// El fix de I1 (contar los encuentros VIVOS de la semana, por complemento) se
// escribió sin un solo test: la decisión vivía adentro de las queries de
// `encuentrosSinClasificar` y lo único que había para verificarla era leer
// código. Es justo el tipo de cambio donde el SIGNO importa: si el complemento
// quedara al revés, o el sello se bloquea eternamente —y nadie lo nota hasta
// que la institución reclama el cumplimiento— o vuelve a sellar de más, que es
// el bug original.

// ─── El margen del rango: la otra mitad de la precondición ───────────────────
// `encuentrosSinClasificarEnRango` pide las consultas inmediatas con UN DÍA de
// más de cada lado y después las filtra en JS. El margen existe porque la query
// filtra por `created_at` y la pertenencia al período la decide el día de la
// ASIGNACIÓN (R31 bis): son dos instantes distintos y pueden caer en días
// distintos. Sin el margen, una CI asignada en el borde no entraba siquiera a
// la lista de candidatos y el sello no la veía.
//
// Las dos piezas del margen —correr un día, y de dónde sale el día— no tenían
// un solo test, y son justo las que deciden si el sello ve o no ve un encuentro
// del último día del mes.

test("margen · correr un día cruza fin de mes, fin de año y el 29 de febrero", () => {
  assert.equal(correrDias("2026-10-31", 1), "2026-11-01");
  assert.equal(correrDias("2026-11-01", -1), "2026-10-31");
  assert.equal(correrDias("2026-12-31", 1), "2027-01-01");
  assert.equal(correrDias("2027-01-01", -1), "2026-12-31");
  // Bisiesto: 2028 tiene 29 de febrero; 2026 no.
  assert.equal(correrDias("2028-02-28", 1), "2028-02-29");
  assert.equal(correrDias("2026-02-28", 1), "2026-03-01");
  assert.equal(correrDias("2026-10-19", 0), "2026-10-19");
});

test("margen · el día de una CI es el de su ASIGNACIÓN, no el de su creación", () => {
  // El caso que el margen rescata: la consulta se creó el 31 a las 23:58 y el
  // otorgador la asignó el 1 a las 00:03. Es de noviembre, aunque la query del
  // sello de octubre la traiga por `created_at`.
  assert.equal(
    diaARdeConsulta({
      created_at: "2026-10-31T23:58:00-03:00",
      asignada_at: "2026-11-01T00:03:00-03:00",
    }),
    "2026-11-01"
  );
  // Y el simétrico, que es el que se perdía sin el margen: la fila se creó ya
  // en noviembre pero la asignación fue el 31, así que la consulta es de
  // OCTUBRE y el sello de octubre tiene que verla — aunque su `created_at`
  // caiga fuera del rango por el que pregunta la query.
  assert.equal(
    diaARdeConsulta({
      created_at: "2026-11-01T00:02:00-03:00",
      asignada_at: "2026-10-31T23:59:00-03:00",
    }),
    "2026-10-31"
  );
});

test("margen · sin asignación manda la creación, y el corte es AR, no UTC", () => {
  assert.equal(diaARdeConsulta({ created_at: "2026-10-31T22:00:00-03:00" }), "2026-10-31");
  assert.equal(
    diaARdeConsulta({ created_at: "2026-10-31T22:00:00-03:00", asignada_at: null }),
    "2026-10-31"
  );
  // 22:00 ART del 31 es 01:00 UTC del 1: leído en UTC, esta CI se iría de mes.
  assert.equal(
    new Date("2026-10-31T22:00:00-03:00").toISOString().slice(0, 10),
    "2026-11-01",
    "el mismo instante, en UTC, es del mes siguiente"
  );
});

test("sello · la CI colgada del domingo 20:00 bloquea: el lunes 02:00 todavía no es terminal", () => {
  // EL caso de I1. La cierra `cerrar-huerfanas` recién más tarde, así que el
  // sello del lunes no la veía, se sellaba la semana sin ella, y cuando
  // aparecía su fila facturable el cumplimiento sellado ya no la podía
  // incorporar. La factura la cobraba igual: dos números contractuales
  // divergiendo en silencio.
  assert.equal(destinoDelEncuentro("consulta", "en_curso"), "vivo");
  assert.equal(bloqueaElSello("consulta", "en_curso", false), true);
  assert.equal(bloqueaElSello("consulta", "pagada", false), true);
  assert.equal(bloqueaElSello("consulta", "aceptada", false), true);
});

test("sello · los cuatro estados SIN DESTINO no bloquean nunca: si bloquearan, el sello se traba para siempre", () => {
  // `disponible`, `bloqueado` y `bloqueado_sin_cobro` no tienen paciente;
  // `reprogramado` sí lo tiene y NO es terminal, pero es el rastro de un turno
  // que se movió: el encuentro real es el turno nuevo y este no va a cambiar de
  // estado nunca más. Ninguno va a producir fila en el contador jamás.
  for (const estado of ["disponible", "bloqueado", "bloqueado_sin_cobro", "reprogramado"]) {
    assert.equal(destinoDelEncuentro("turno", estado), "sin_destino", estado);
    assert.equal(bloqueaElSello("turno", estado, false), false, estado);
    assert.equal(bloqueaElSello("turno", estado, true), false, estado);
  }
});

test("sello · un turno terminal bloquea SOLO si le falta la fila del contador", () => {
  for (const estado of [
    "completado",
    "ausente_paciente",
    "ausente_medico",
    "cancelado_paciente",
    "cancelado_medico",
  ]) {
    assert.equal(destinoDelEncuentro("turno", estado), "terminal", estado);
    assert.equal(bloqueaElSello("turno", estado, false), true, `${estado} sin fila`);
    assert.equal(bloqueaElSello("turno", estado, true), false, `${estado} con fila`);
  }
});

test("sello · un turno vivo bloquea aunque ya tenga fila: todavía puede cambiar de estado", () => {
  for (const estado of ["confirmado", "en_espera", "en_curso", "reservado_pendiente"]) {
    assert.equal(destinoDelEncuentro("turno", estado), "vivo", estado);
    assert.equal(bloqueaElSello("turno", estado, true), true, estado);
  }
});

test("sello · un estado DESCONOCIDO bloquea: es complemento, no lista blanca", () => {
  // El default no puede ser "sellá igual". Sellar es irreversible; la duda se
  // resuelve esperando, que es barato.
  assert.equal(destinoDelEncuentro("turno", "estado_que_no_existe_todavia"), "vivo");
  assert.equal(bloqueaElSello("turno", "estado_que_no_existe_todavia", true), true);
  assert.equal(bloqueaElSello("consulta", "estado_que_no_existe_todavia", true), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// UNA SEMANA CERRADA NO SE VUELVE A CERRAR — Y LA VACÍA TAMBIÉN SE CIERRA
// ─────────────────────────────────────────────────────────────────────────────
// El crítico del gate, del lado semanal. Con el padrón vacío `cerrarSemana`
// volvía sin escribir nada, así que esa semana nunca quedaba registrada como
// cerrada: seguía apareciendo pendiente todos los días y, el día que entraba
// alguien al padrón, el barrido la veía abierta y la sellaba CON ÉL —
// cumplimiento sellado sobre una semana que la institución ya había leído como
// "en curso". Se prueba con una base de mentira detrás del puerto, que respeta
// las mismas reglas que las queries reales.

function profesional(id: string, sellada = false): CumplimientoProfesional {
  return {
    medicoId: id,
    nombre: `Profesional ${id}`,
    especialidad: "Prueba",
    horasComprometidas: 10,
    minutosComprometidos: 600,
    minutosCumplidos: 600,
    minutosTurnos: 600,
    minutosCI: 0,
    porcentaje: 100,
    motores: { acordado: 600, espontaneo: 0, ofrecido: 0 },
    badge: "Cumplido",
    sellada,
  };
}

/**
 * `acuerdo_semanas` + `acuerdo_semanas_cerradas`, en memoria. `padron` es el
 * universo de HOY: se le pueden agregar profesionales DESPUÉS del cierre, que
 * es justo el escenario que importa.
 */
function baseSemanal(padron: string[] = []) {
  const llamadas = { sellar: 0, faltantes: 0, cumplimiento: 0 };
  const selladas = new Map<string, Set<string>>(); // semana → medicoIds
  const marcas = new Map<string, { profesionales: number; sellados: number }>();
  const sellosDe = (semana: string) => selladas.get(semana) ?? new Set<string>();
  const puerto: PuertoCierreSemana = {
    estaCerrada: async (semana) => marcas.has(semana) || sellosDe(semana).size > 0,
    sellados: async (semana) => sellosDe(semana).size,
    faltantes: async () => {
      llamadas.faltantes++;
      return { sin_fila: 0, vivos: 0, total: 0 };
    },
    // `cumplimientoDeSemana`: el universo es el padrón de HOY ∪ los sellados de
    // esa semana, y `sellada` sale de si ya tiene fila.
    cumplimiento: async (semana) => {
      llamadas.cumplimiento++;
      const conSello = sellosDe(semana);
      const ids = [...new Set([...padron, ...conSello])].sort();
      return ids.map((id) => profesional(id, conSello.has(id)));
    },
    sellar: async (semana, filas) => {
      llamadas.sellar++;
      const set = selladas.get(semana) ?? new Set<string>();
      for (const f of filas) set.add(f.medicoId);
      selladas.set(semana, set);
    },
    marcar: async (semana, profesionales, sellados) => {
      if (!marcas.has(semana)) marcas.set(semana, { profesionales, sellados });
    },
  };
  return { puerto, llamadas, selladas, marcas, padron };
}

const LUNES_SIGUIENTE = Date.parse("2026-10-26T04:00:00-03:00"); // cierra la del 19

test("cierre semanal · la semana con padrón se sella y queda marcada", async () => {
  const base = baseSemanal(["m1", "m2"]);
  const r = await cerrarSemana(LUNES, LUNES_SIGUIENTE, base.puerto);
  assert.equal(r.sellados, 2);
  assert.equal(r.profesionales, 2);
  assert.equal(r.errores, 0);
  assert.deepEqual(base.marcas.get(LUNES), { profesionales: 2, sellados: 2 });
});

test("cierre semanal · la semana SIN NADIE en el padrón queda cerrada igual, y se nota", async () => {
  // Sin marca explícita, "cerrada en cero" y "nunca se cerró" se ven iguales: no
  // hay ninguna fila que contar en `acuerdo_semanas`.
  const base = baseSemanal([]);
  const r = await cerrarSemana(LUNES, LUNES_SIGUIENTE, base.puerto);
  assert.equal(r.profesionales, 0);
  assert.equal(r.sellados, 0);
  assert.equal(r.errores, 0);
  assert.ok(base.marcas.has(LUNES), "la semana vacía queda MARCADA como cerrada");

  // Un mes después entra el primer profesional al padrón. La semana vieja NO se
  // sella con él: la institución ya la leyó.
  base.padron.push("m1");
  const segundo = await cerrarSemana(LUNES, Date.parse("2026-11-23T04:00:00-03:00"), base.puerto);
  assert.equal(base.llamadas.sellar, 0, "no se escribe ni una fila");
  assert.equal(base.llamadas.cumplimiento, 1, "ni se recalcula el cumplimiento");
  assert.equal(segundo.sellados, 0);
});

test("cierre semanal · una semana ya cerrada ni evalúa la precondición del contador", async () => {
  const base = baseSemanal(["m1"]);
  await cerrarSemana(LUNES, LUNES_SIGUIENTE, base.puerto);
  base.padron.push("m2"); // entra al padrón DESPUÉS del cierre

  const segundo = await cerrarSemana(LUNES, Date.parse("2026-11-02T04:00:00-03:00"), base.puerto);
  assert.equal(base.llamadas.faltantes, 1, "la segunda vez no se evalúa");
  assert.equal(base.llamadas.sellar, 1, "el upsert ni se intenta");
  assert.equal(segundo.sellados, 0);
  assert.equal(segundo.ya_estaban, 1);
  assert.ok(!base.selladas.get(LUNES)?.has("m2"), "el que llegó después no entra a la semana");
});

test("cierre semanal · si el sello falla, la semana NO queda marcada como cerrada", async () => {
  // El orden es sellar → marcar. Una semana marcada cuyas filas no se
  // escribieron mostraría cero horas cumplidas teniendo actividad, y no volvería
  // nunca al barrido.
  const base = baseSemanal(["m1"]);
  const puerto: PuertoCierreSemana = {
    ...base.puerto,
    sellar: async () => {
      throw new Error("timeout de la base");
    },
  };
  const r = await cerrarSemana(LUNES, LUNES_SIGUIENTE, puerto);
  assert.equal(r.errores, 1);
  assert.equal(r.sellados, 0);
  assert.equal(base.marcas.size, 0, "ninguna semana marcada sin su cumplimiento escrito");
});

test("cierre semanal · una semana sellada ANTES de la 024 recibe la marca en la primera pasada", async () => {
  // Es la deuda de transición: "cerrada" es la marca O las filas. Sin esto, toda
  // semana sellada antes de la migración volvería al barrido para siempre.
  const base = baseSemanal([]);
  base.selladas.set(LUNES, new Set(["m1", "m2", "m3"]));
  const r = await cerrarSemana(LUNES, LUNES_SIGUIENTE, base.puerto);
  assert.deepEqual(base.marcas.get(LUNES), { profesionales: 3, sellados: 0 });
  assert.equal(r.ya_estaban, 3);
  assert.equal(base.llamadas.sellar, 0);
});

test("cierre semanal · la semana EN CURSO no se cierra ni con el padrón vacío", async () => {
  const base = baseSemanal([]);
  await assert.rejects(
    () => cerrarSemana("2026-10-26", LUNES_SIGUIENTE, base.puerto),
    /TODAVÍA NO TERMINÓ/
  );
  assert.equal(base.marcas.size, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// EL PANEL DE UNA SEMANA CERRADA NO SE MUEVE (la otra mitad de la 024)
// ─────────────────────────────────────────────────────────────────────────────
// `cerrarSemana` ya no vuelve sobre una semana cerrada, pero el PANEL la
// calculaba igual: su universo era "el padrón de HOY ∪ los sellados", así que
// un profesional dado de alta DESPUÉS del cierre estrenaba una fila viva —con
// sus horas comprometidas enteras y cero cumplidas— en una semana que la
// institución ya había leído. En la semana cerrada en CERO el efecto era
// completo: cero filas antes del alta, una de 10 h después. Nadie toca plata,
// pero el KPI de arriba (`totalDeBolsa` suma las filas listadas) cambiaba solo
// entre dos visitas al mismo panel.
//
// Se prueba contra la función REAL, con el puerto de las lecturas del sello: la
// rama en vivo ni se toca (si se tocara, el fake no alcanzaría y el test
// fallaría por intentar hablar con Supabase, que es la señal correcta).

/** Sello de `acuerdo_semanas` como lo devuelve la base. */
function sello(medicoId: string, minutosCumplidos = 600) {
  return {
    medico_id: medicoId,
    horas_comprometidas: 10,
    minutos_cumplidos: minutosCumplidos,
    desglose_motores: {
      turnos: minutosCumplidos,
      ci: 0,
      motores: { acordado: minutosCumplidos, espontaneo: 0, ofrecido: 0 },
    },
    estado: "cerrada",
  };
}

/** El padrón de HOY, que puede tener gente que entró después del cierre. */
function puertoDelPanel(params: {
  marcada: boolean;
  sellos: ReturnType<typeof sello>[];
  padron: string[];
}): PuertoSemanaSellada {
  return {
    marcada: async () => params.marcada,
    sellos: async () => params.sellos,
    // El panel busca los nombres de los ids que le pidan; el padrón de hoy los
    // tiene a todos (los sellados que ya se fueron también se resuelven).
    perfiles: async (ids) =>
      ids.map((id) => ({ id, nombre: `Profesional ${id}`, especialidad: "Prueba" })),
  };
}

test("panel · la semana cerrada EN CERO no le abre fila a quien entró después", async () => {
  // El caso reproducido: semana MARCADA cerrada, cero filas selladas, y un alta
  // posterior al cierre. Antes devolvía [{ sellada: false, minutosComprometidos: 600 }].
  const filas = await cumplimientoDeSemana({
    semanaAr: LUNES,
    ahoraMs: LUNES_SIGUIENTE,
    puerto: puertoDelPanel({ marcada: true, sellos: [], padron: ["m1"] }),
  });
  assert.deepEqual(filas, [], "la semana cerrada en cero se muestra en cero, siempre");
});

test("panel · la semana cerrada muestra lo sellado y NADA más", async () => {
  const filas = await cumplimientoDeSemana({
    semanaAr: LUNES,
    ahoraMs: LUNES_SIGUIENTE,
    puerto: puertoDelPanel({
      marcada: true,
      sellos: [sello("m1", 600), sello("m2", 300)],
      padron: ["m1", "m2", "m3"], // m3 entró DESPUÉS del cierre
    }),
  });
  assert.deepEqual(
    filas.map((f) => f.medicoId),
    ["m1", "m2"],
    "el que entró después del cierre no aparece"
  );
  assert.ok(
    filas.every((f) => f.sellada),
    "ninguna fila de una semana cerrada se recalcula"
  );
  assert.equal(filas[0].minutosCumplidos, 600);
  assert.equal(filas[0].badge, "Cumplido");
  assert.equal(filas[1].minutosCumplidos, 300);
  assert.equal(filas[1].badge, "Incompleto");
  // El KPI de arriba suma las filas listadas: es el número que no se puede mover.
  assert.deepEqual(totalDeBolsa(filas), {
    minutosCumplidos: 900,
    minutosComprometidos: 1200,
    porcentaje: 75,
  });
});

test("panel · una semana cerrada ANTES de la 024 (sellos sin marca) también es cerrada", () => {
  // Transición: "cerrada" es la marca O las filas selladas, igual que en
  // `semanaEstaCerrada`. Si solo mirara la marca, el panel de esas semanas
  // volvería a agregarle filas vivas a lo ya sellado.
  assert.equal(cumplimientoSaleDeLoSellado({ marcada: false, sellos: 3 }), true);
  assert.equal(cumplimientoSaleDeLoSellado({ marcada: true, sellos: 0 }), true);
  // Y la semana abierta se sigue calculando al vuelo, que es todo el panel de
  // la semana en curso.
  assert.equal(cumplimientoSaleDeLoSellado({ marcada: false, sellos: 0 }), false);
});

test("panel · el sello sin ficha del profesional NO desaparece de la tabla", () => {
  // El minuto sellado sostiene un acuerdo: si la ficha ya no está, se pierde el
  // nombre, nunca la fila.
  const filas = filasDeLoSellado([sello("m9", 120)], new Map());
  assert.equal(filas.length, 1);
  assert.equal(filas[0].medicoId, "m9");
  assert.equal(filas[0].minutosCumplidos, 120);
  assert.deepEqual(filas[0].motores, { acordado: 120, espontaneo: 0, ofrecido: 0 });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL BARRIDO NO PUEDE DEJARLE LA CORRIDA ENTERA A LAS MÁS VIEJAS
// ─────────────────────────────────────────────────────────────────────────────

test("barrido semanal · la más reciente SIEMPRE entra en la corrida", () => {
  const pendientes = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-10-12"];
  assert.deepEqual(semanasDeLaCorrida(pendientes), ["2026-09-07", "2026-10-12"]);
  // Y si las viejas siguen trabadas mañana, la reciente igual se toca.
  assert.deepEqual(semanasDeLaCorrida(pendientes, 3), [
    "2026-09-07",
    "2026-09-14",
    "2026-10-12",
  ]);
});

test("barrido semanal · con pocas pendientes se toman todas, sin duplicar la última", () => {
  assert.deepEqual(semanasDeLaCorrida([]), []);
  assert.deepEqual(semanasDeLaCorrida(["2026-10-12"]), ["2026-10-12"]);
  assert.deepEqual(semanasDeLaCorrida(["2026-10-05", "2026-10-12"]), [
    "2026-10-05",
    "2026-10-12",
  ]);
});

test("barrido semanal · ninguna semana se procesa dos veces en la misma corrida", () => {
  const pendientes = ["a", "b", "c", "d", "e", "f", "g", "h"];
  for (const max of [1, 2, 3, 8]) {
    const corrida = semanasDeLaCorrida(pendientes, max);
    assert.equal(new Set(corrida).size, corrida.length, `max=${max} duplica`);
    assert.ok(corrida.length <= max, `max=${max} se pasa del techo`);
  }
  assert.deepEqual(semanasDeLaCorrida(pendientes, 1), ["a"], "con un solo lugar gana la más vieja");
  assert.deepEqual(semanasDeLaCorrida(pendientes, 0), []);
});

test("barrido semanal · dos trabadas no dejan a las del medio sin intentarse NUNCA", () => {
  // El residual: reservar el último lugar arregla la punta nueva y deja el mismo
  // hambre una fila más abajo. Con max=2 y las DOS puntas trabadas de forma
  // permanente, la corrida era siempre [la vieja rota, la reciente rota] y las
  // seis del medio no se tocaban hasta que la ventana de ocho las expulsara.
  const TODAS = ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"];
  const TRABADAS = new Set(["c0", "c7"]);

  // 1) La cobertura, sobre la lista quieta: en `viejas.length` corridas se
  //    intenta TODA pendiente vieja, esté trabada la que esté.
  const intentadas = new Set<string>();
  for (let corrida = 0; corrida < TODAS.length - 1; corrida++) {
    for (const s of semanasDeLaCorrida(TODAS, SEMANAS_POR_CORRIDA, corrida)) intentadas.add(s);
  }
  assert.deepEqual([...intentadas].sort(), TODAS, "quedó alguna sin intentarse");

  // 2) Y el barrido de verdad: las que se pueden sellar se sellan y salen de la
  //    lista. Antes, seis corridas dejaban la tabla vacía (siempre las mismas
  //    dos trabadas); ahora las seis del medio quedan selladas.
  let pendientes = [...TODAS];
  const selladas: string[] = [];
  for (let corrida = 0; corrida < 12 && pendientes.length > TRABADAS.size; corrida++) {
    for (const semana of semanasDeLaCorrida(pendientes, SEMANAS_POR_CORRIDA, corrida)) {
      if (TRABADAS.has(semana)) continue; // la precondición aborta, se reintenta
      selladas.push(semana);
      pendientes = pendientes.filter((s) => s !== semana);
    }
  }
  assert.deepEqual(selladas.sort(), ["c1", "c2", "c3", "c4", "c5", "c6"]);
  assert.deepEqual(pendientes, ["c0", "c7"], "solo quedan pendientes las trabadas");
});

test("barrido semanal · la rotación sale del día y no de una tabla de estado", () => {
  // `corridaDelBarrido` es lo único que hace que la corrida de hoy no repita la
  // de ayer. Tiene que subir de a uno por día y ser el mismo número dentro de
  // una misma corrida (el cron corre a las 04:00 ART).
  const lunes = Date.parse("2026-10-26T04:00:00-03:00");
  const martes = Date.parse("2026-10-27T04:00:00-03:00");
  assert.equal(corridaDelBarrido(martes) - corridaDelBarrido(lunes), 1);
  assert.equal(
    corridaDelBarrido(lunes),
    corridaDelBarrido(lunes + 60_000),
    "un reintento un minuto después es la MISMA corrida"
  );
  // Días AR consecutivos, números consecutivos: nunca dos veces el mismo salto.
  const saltos = new Set<number>();
  for (let i = 0; i < 14; i++) {
    saltos.add(corridaDelBarrido(lunes + i * 86_400_000));
  }
  assert.equal(saltos.size, 14);
});

// ─────────────────────────────────────────────────────────────────────────────
// LA MIGRACIÓN 024 — la marca tiene que ser inmutable, o "cerrada" es opinión
// ─────────────────────────────────────────────────────────────────────────────

const SQL_024 = readFileSync(
  join(process.cwd(), "supabase/migrations-institucional/024_semanas_cerradas.sql"),
  "utf8"
);

test("024 · una semana cerrada no se reabre ni se borra", () => {
  assert.match(SQL_024, /BEFORE UPDATE ON acuerdo_semanas_cerradas/);
  assert.match(SQL_024, /BEFORE DELETE ON acuerdo_semanas_cerradas/);
  assert.match(SQL_024, /BEFORE TRUNCATE ON acuerdo_semanas_cerradas/);
  assert.match(
    SQL_024,
    /REVOKE TRUNCATE ON acuerdo_semanas_cerradas FROM anon, authenticated, service_role/
  );
  assert.match(SQL_024, /ENABLE ROW LEVEL SECURITY/);
});

test("024 · es reentrante: volver a aplicarla no rompe nada", () => {
  assert.match(SQL_024, /CREATE TABLE IF NOT EXISTS acuerdo_semanas_cerradas/);
  const triggers = SQL_024.match(/DROP TRIGGER IF EXISTS/g) ?? [];
  assert.equal(triggers.length, 3, "los tres triggers se dropean antes de crearse");
});
