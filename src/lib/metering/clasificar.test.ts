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

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reconstruirReloj,
  clasificar,
  componerFila,
  yaSePuedeClasificar,
  motorDeCanal,
  SEGUNDOS_FACTURABLE,
  type Clasificacion,
  type EncuentroCandidato,
  type EventoPresencia,
} from "@/lib/metering/clasificar";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE — la semana del 19 al 25 de octubre (mock 4)
// ─────────────────────────────────────────────────────────────────────────────

const LUNES = "2026-10-19"; // lunes AR
const DURACION_SLOT_MIN = 15;

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

test("mock 4 · en el contador no existe ningún concepto de Mercado Pago", () => {
  const claves = Object.keys(filas[0]);
  assert.equal(
    claves.some((k) => k.startsWith("mp_") || k.includes("pago") || k.includes("monto")),
    false,
    `columnas del contador: ${claves.join(", ")}`
  );
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
  });
  assert.ok(domingo);
  assert.equal(domingo.semana_ar, LUNES);
  assert.equal(domingo.fecha_ar, "2026-10-25");
});
