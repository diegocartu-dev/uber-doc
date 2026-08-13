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
import {
  ESTADOS_CONSULTA_VALIDOS,
  ESTADOS_TURNO_VALIDOS,
  ESTADOS_TERMINALES_CONSULTA,
  ESTADOS_TERMINALES_TURNO,
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
  semanaDeHoy,
  semanaAnterior,
  semanaSiguiente,
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
// EL CONTRATO CON LA BASE
//
// Estas dos listas se mandan a PostgREST dentro de un `.in()`. No son adorno:
// un valor que la base no conoce rompe el contador de dos maneras distintas y
// las dos son caras (ver el comentario largo en clasificar.ts).
//
// Incidente que motiva estos tests (13/08/2026): `ESTADOS_TERMINALES_CONSULTA`
// tenía "rechazada", que nunca existió en el enum. El cron devolvió 500 en el
// 100 % de sus corridas desde que se prendió y el contador nunca contó nada.
//
// Si alguno de estos tests falla, la respuesta NO es agregar el valor al set de
// válidos: es preguntarse si ese estado existe de verdad en la base.
// ─────────────────────────────────────────────────────────────────────────────

test("contrato · todo estado terminal de consulta existe en el enum de la base", () => {
  const validos = new Set<string>(ESTADOS_CONSULTA_VALIDOS as unknown as string[]);
  for (const estado of ESTADOS_TERMINALES_CONSULTA as unknown as string[]) {
    assert.ok(
      validos.has(estado),
      `"${estado}" no es miembro de estado_consulta: la query entera va a fallar ` +
        `con "invalid input value for enum" y el contador no va a devolver NI UNA fila`
    );
  }
});

test("contrato · todo estado terminal de turno pasa el CHECK de la base", () => {
  const validos = new Set<string>(ESTADOS_TURNO_VALIDOS as unknown as string[]);
  for (const estado of ESTADOS_TERMINALES_TURNO as unknown as string[]) {
    assert.ok(
      validos.has(estado),
      `"${estado}" no está en el CHECK de turnos.estado: no va a matchear nunca ` +
        `y esos encuentros se quedan sin contar EN SILENCIO`
    );
  }
});

test("contrato · 'rechazada' no vuelve: no existe en la base", () => {
  // Aserción negativa explícita. El valor estuvo en el código meses y suena
  // plausible — es un estado real de OTRAS tablas, no de `consultas`.
  assert.ok(!(ESTADOS_CONSULTA_VALIDOS as unknown as string[]).includes("rechazada"));
  assert.ok(!(ESTADOS_TERMINALES_CONSULTA as unknown as string[]).includes("rechazada"));
});
