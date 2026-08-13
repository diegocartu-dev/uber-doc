// LA REGLA DE ORO, APLICADA AL MODO DEMO.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// ── QUÉ FIJA ESTE ARCHIVO ────────────────────────────────────────────────────
// El modo demo suma preguntas nuevas a caminos que el B2C recorre TODOS LOS
// DÍAS con plata y con documentos clínicos reales: la generación de cada PDF le
// pregunta ahora "¿este documento es de demostración?", y la página pública de
// verificación, lo mismo.
//
// Con `INSTITUCIONAL` apagado, esas preguntas tienen que responderse SIN TOCAR
// LA BASE. No alcanza con que devuelvan `false`: `documentoEsDemo` se traga sus
// errores a propósito, así que un gate escrito al revés devolvería `false`
// igual —después de un round-trip fallido contra una base donde la columna
// `es_demo` ni existe— y el golden del PDF seguiría verde mientras cada receta
// del B2C paga una consulta de más.
//
// El instrumento es el mismo que usa `branding-pdf.test.ts`: un espía sobre
// `globalThis.fetch`, por donde sale supabase-js. Cero llamadas es la prueba
// literal de "no tocó la DB".

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  documentoEsDemo,
  medicosDemo,
  destinoDemoPaciente,
  crearSesionDemo,
  listarSesionesDemo,
  participantesDeSesion,
  marcarParticipanteEntro,
  ESPERA_DEMO,
} from "@/lib/institucional/demo";
import { provisionarProfesionalDemo, matriculaDemo } from "@/lib/institucional/demo-profesional";
import { sinEncuentrosDemo } from "@/lib/metering/clasificar";

const DOC = "00000000-0000-0000-0000-0000000000e5";
const PACIENTE = "00000000-0000-0000-0000-0000000000a1";
const USER = "00000000-0000-0000-0000-0000000000f6";

async function conEspiaDeRed<T>(fn: () => Promise<T>): Promise<{ valor: T; llamadas: number }> {
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    llamadas++;
    void args;
    throw new Error("red bloqueada en el test");
  }) as typeof fetch;
  try {
    return { valor: await fn(), llamadas };
  } finally {
    globalThis.fetch = original;
  }
}

function sinModoInstitucional() {
  delete process.env.INSTITUCIONAL;
}

// ─────────────────────────────────────────────────────────────────────────────
// FLAG APAGADO — el B2C ni se entera de que el modo demo existe
// ─────────────────────────────────────────────────────────────────────────────

test("B2C: el PDF no le pregunta a la base si el documento es de demostración", async () => {
  sinModoInstitucional();
  const { valor, llamadas } = await conEspiaDeRed(() => documentoEsDemo(DOC));
  assert.equal(valor, false, "el B2C marcaría un documento como demo: el gate está al revés");
  assert.equal(llamadas, 0, "el B2C salió a la red por la marca de demo");
});

test("B2C: ningún reporte se pone a buscar profesionales de demostración", async () => {
  sinModoInstitucional();
  const { valor, llamadas } = await conEspiaDeRed(() => medicosDemo());
  assert.equal(valor.size, 0);
  assert.equal(llamadas, 0);
});

test("B2C: resolver el destino de un paciente de demo no toca la base", async () => {
  sinModoInstitucional();
  const { valor, llamadas } = await conEspiaDeRed(() =>
    destinoDemoPaciente({ pacienteId: PACIENTE, userId: USER })
  );
  assert.equal(valor, ESPERA_DEMO);
  assert.equal(llamadas, 0);
});

test("B2C: las pantallas de la reunión no existen y no consultan nada", async () => {
  sinModoInstitucional();
  const listado = await conEspiaDeRed(() => listarSesionesDemo());
  assert.deepEqual(listado.valor, []);
  assert.equal(listado.llamadas, 0);

  const participantes = await conEspiaDeRed(() => participantesDeSesion("cualquiera"));
  assert.deepEqual(participantes.valor, []);
  assert.equal(participantes.llamadas, 0);

  const entro = await conEspiaDeRed(() => marcarParticipanteEntro("cualquiera"));
  assert.equal(entro.llamadas, 0);
});

test("B2C: no se puede crear una reunión ni un profesional de demostración", async () => {
  sinModoInstitucional();

  const sesion = await conEspiaDeRed(() =>
    crearSesionDemo({ nombre: "X", adminUserId: USER })
  );
  assert.equal(sesion.valor.ok, false);
  assert.equal(sesion.llamadas, 0, "el B2C intentó escribir una reunión de demo");

  const profesional = await conEspiaDeRed(() =>
    provisionarProfesionalDemo({
      sesionId: "cualquiera",
      datos: {
        nombre: "Nombre Apellido",
        celular: null,
        rol: "profesional",
        dni: null,
        fecha_nacimiento: null,
        especialidad: null,
      },
    })
  );
  assert.equal(profesional.valor.ok, false);
  assert.equal(profesional.llamadas, 0, "el B2C intentó crear una cuenta de profesional de demo");
});

// ─────────────────────────────────────────────────────────────────────────────
// La matrícula del profesional de demostración
// ─────────────────────────────────────────────────────────────────────────────

test("la matrícula de una cuenta de demo no puede confundirse con una real", () => {
  // Sale impresa en el documento, y es el primer lugar donde mira una farmacia.
  // Un número plausible le atribuiría la receta a una persona real.
  const m = matriculaDemo("a1b2c3d4");
  assert.match(m, /^DEMO-/);
  assert.equal(/^\d+$/.test(m), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// EL CONTADOR CONTRACTUAL — lo que pasó en una demo no se factura
// ─────────────────────────────────────────────────────────────────────────────

test("los encuentros de una reunión no entran a la factura de la institución", () => {
  // Una consulta de demo es una atención de verdad —hubo videollamada, hubo
  // receta— pero el "paciente" era un participante de la reunión. Si entrara al
  // contador, la provincia recibiría una factura con consultas que nunca pidió.
  const cola = [
    { id: "real-1", es_demo: false },
    { id: "de-la-reunion", es_demo: true },
    { id: "real-2" }, // sin la columna: encuentro viejo, anterior a la migración
  ];
  const quedan = sinEncuentrosDemo(cola).map((c) => c.id);
  assert.deepEqual(quedan, ["real-1", "real-2"]);
});

test("un encuentro sin marca se factura: la marca es la excepción, no la regla", () => {
  // Al revés sería peor de los dos lados posibles: dejaría de facturarse
  // servicio realmente prestado y nadie se enteraría hasta el cierre del mes.
  assert.deepEqual(sinEncuentrosDemo([{ es_demo: undefined }]).length, 1);
});
