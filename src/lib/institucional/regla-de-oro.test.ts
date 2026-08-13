// GOLDEN TEST DE LA REGLA DE ORO — runner: node:test + node:assert con tsx.
// Ejecutar:  npx tsx --test src/lib/institucional/regla-de-oro.test.ts
//
// ── QUÉ FIJA ESTE ARCHIVO ────────────────────────────────────────────────────
// La regla de oro del modo institucional dice: con `INSTITUCIONAL` sin setear,
// el B2C se comporta IDÉNTICO. Hasta ahora eso se sostenía leyendo los gates
// hunk por hunk en cada revisión (gate #403, observación 5 y riesgo técnico 7:
// "riesgo de regresión B2C si el gate queda mal"). Este test lo automatiza.
//
// Lo que se testea es LA DECISIÓN, no el efecto: cada delta por modo del
// código compartido pasa por una función chica que dice "cortá" o "seguí", y
// acá se verifica que con el flag apagado TODAS dicen "seguí". Un gate escrito
// al revés (`if (!esInstitucional())`) rompe estos tests antes de llegar a
// producción — que es el modo de falla que importa: silencioso, en el B2C, y
// sobre plata real.
//
// Cubre los cuatro puntos del gate:
//   (a) los 5 crons de Capa C siguen su camino B2C;
//   (b) resolver-vencidas y cancelaciones toman la rama de refund;
//   (c) el callback NO consulta operadores (contador de llamadas a la DB);
//   (d) el middleware no evalúa la lista de rutas bloqueadas.
//
// Y el complemento: con el flag PRENDIDO, cada uno hace lo suyo. Un test que
// solo mirara el lado apagado pasaría con los gates borrados.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  bloqueaRutaInstitucional,
  correspondeRefund,
  permiteAutoCrearPaciente,
  destinoSinSesion,
  destinoConfirmacionCI,
  rebotePaciente,
  esInstitucional,
} from "@/lib/instancia";
import { cortarSiInstitucional, CRONS_CAPA_C } from "@/lib/institucional/capa-c";
import { cortarSiB2C, CRONS_SOLO_INSTITUCIONALES } from "@/lib/institucional/crons-institucionales";
import { resolverRolInstitucional, type OperadorActivo } from "@/lib/auth/rol-institucional";

const PAGO = "1234567890"; // id de pago sintético
const USER = "00000000-0000-0000-0000-000000000001";

const RUTAS_BLOQUEADAS = [
  "/auth/register",
  "/auth/registro-medico",
  "/clinica",
  "/clinica/algun-medico/turnos",
  "/dr/alguien",
  "/medicos",
  "/triage",
  "/arrepentimiento",
  "/insights",
  // Sumadas en la Etapa 3: la biblioteca personal del paciente del B2C, que la
  // sesión del link dejaba navegable entera.
  "/mis-consultas",
  "/mis-datos",
  "/documentos",
];

/** Las rutas del paciente sin sesión, que en cada modo salen a otro lado. */
const SIN_SESION = ["/turno/abc/acceso", "/turno/abc/espera", "/consulta/abc/sala"];

beforeEach(() => {
  delete process.env.INSTITUCIONAL;
});

// ─────────────────────────────────────────────────────────────────────────────
// FLAG APAGADO — el B2C, idéntico
// ─────────────────────────────────────────────────────────────────────────────

test("(a) los 5 crons de Capa C siguen su camino B2C", () => {
  assert.equal(CRONS_CAPA_C.length, 5);
  for (const key of CRONS_CAPA_C) {
    assert.equal(cortarSiInstitucional(key), null, `${key} NO puede cortar en B2C`);
  }
});

test("(a bis) los crons NUEVOS del modo institucional no hacen NADA en el B2C", () => {
  // El espejo de la Capa C (spec §9): `metering-clasificar` y
  // `acuerdo-cerrar-semana` se invocan en los dos deploys porque `vercel.json`
  // es uno solo. En el B2C sus tablas ni existen — sin este corte cada corrida
  // terminaría en error y el watchdog mandaría mails rojos por una tarea que
  // en el B2C no significa nada.
  assert.equal(CRONS_SOLO_INSTITUCIONALES.length, 2);
  for (const key of CRONS_SOLO_INSTITUCIONALES) {
    const res = cortarSiB2C(key);
    assert.ok(res, `${key} tiene que cortar en el B2C`);
    assert.equal(res.status, 200);
  }
});

test("(b) con un pago registrado, la rama de refund se toma", () => {
  assert.equal(correspondeRefund(PAGO), true);
});

test("(b) sin pago no hay refund — y eso NO tiene nada que ver con el modo", () => {
  // Cuentas de test del B2C: simulan el pago sin registrar uno real.
  assert.equal(correspondeRefund(null), false);
  assert.equal(correspondeRefund(undefined), false);
  assert.equal(correspondeRefund(""), false);
});

test("(c) el callback NO consulta operadores: cero llamadas a la DB", async () => {
  let llamadas = 0;
  const rol = await resolverRolInstitucional(USER, async () => {
    llamadas++;
    return [{ id: "op-1", nombre: "Sintética", tipo: "humano", nivel: "otorgador" } as OperadorActivo];
  });
  assert.equal(rol, null);
  assert.equal(llamadas, 0, "en B2C la tabla `operadores` no existe: ni se la toca");
});

test("(c) el callback SÍ auto-crea la ficha de paciente (es el onboarding del B2C)", () => {
  assert.equal(permiteAutoCrearPaciente(), true);
});

test("(d) el middleware no bloquea NINGUNA ruta por modo", () => {
  for (const ruta of RUTAS_BLOQUEADAS) {
    assert.equal(bloqueaRutaInstitucional(ruta), false, `${ruta} tiene que seguir viva en B2C`);
  }
});

test("(e) sin sesión, el B2C sigue yendo al login de siempre", () => {
  for (const ruta of [...SIN_SESION, "/dashboard", "/admin", "/mis-datos"]) {
    assert.equal(destinoSinSesion(ruta), "/auth/login", ruta);
  }
});

test("(e) los rebotes de las pantallas del B2C no cambian de destino", () => {
  assert.equal(rebotePaciente("/dashboard", "/turno/x/acceso"), "/dashboard");
  assert.equal(rebotePaciente("/auth/login", "/acceso/reenviar"), "/auth/login");
});

test("(f) el paciente del B2C que vuelve del pago se queda en su confirmación", () => {
  // Un gate escrito al revés acá manda a TODO paciente del B2C que acaba de
  // pagar a `/consulta/[id]/acceso`, una ruta que en el B2C no existe: 404
  // después de cobrarle. Es el delta por modo más caro de esta etapa en código
  // compartido, y hasta ahora era un `esInstitucional()` inline que ningún test
  // miraba.
  assert.equal(destinoConfirmacionCI("abc"), null);
});

test("cualquier valor que no sea exactamente 'true' sigue siendo B2C", () => {
  for (const valor of ["", "false", "TRUE", "True", "1", "yes", "si"]) {
    process.env.INSTITUCIONAL = valor;
    assert.equal(esInstitucional(), false, `INSTITUCIONAL=${JSON.stringify(valor)}`);
    assert.equal(cortarSiInstitucional("liberar-reservas"), null);
    assert.ok(cortarSiB2C("metering-clasificar"), "el metering sigue apagado");
    assert.equal(correspondeRefund(PAGO), true);
    assert.equal(permiteAutoCrearPaciente(), true);
    assert.equal(bloqueaRutaInstitucional("/clinica"), false);
    assert.equal(destinoSinSesion("/turno/x/acceso"), "/auth/login");
    assert.equal(rebotePaciente("/dashboard", "/turno/x/acceso"), "/dashboard");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FLAG PRENDIDO — sin esto, borrar los gates también pasaría los tests
// ─────────────────────────────────────────────────────────────────────────────

test("prendido: los 5 crons cortan con la MISMA respuesta de siempre", async () => {
  process.env.INSTITUCIONAL = "true";
  for (const key of CRONS_CAPA_C) {
    const res = cortarSiInstitucional(key);
    assert.ok(res, `${key} tiene que cortar en la instancia`);
    assert.equal(res.status, 200);
    // El body lo leen el heartbeat de withCron y el watchdog: no puede cambiar.
    assert.deepEqual(await res.json(), { ok: true, mensaje: "modo institucional: no aplica" });
  }
});

test("prendido: los crons del metering SÍ hacen su trabajo", () => {
  process.env.INSTITUCIONAL = "true";
  for (const key of CRONS_SOLO_INSTITUCIONALES) {
    assert.equal(cortarSiB2C(key), null, `${key} NO puede cortar en la instancia`);
  }
});

test("prendido: no hay refund ni con pago_id sucio", () => {
  process.env.INSTITUCIONAL = "true";
  assert.equal(correspondeRefund(PAGO), false);
});

test("prendido: no se auto-crea ficha de paciente (padrón provisionado)", () => {
  process.env.INSTITUCIONAL = "true";
  assert.equal(permiteAutoCrearPaciente(), false);
});

test("prendido: las rutas del B2C que no existen en la instancia dan 404", () => {
  process.env.INSTITUCIONAL = "true";
  for (const ruta of RUTAS_BLOQUEADAS) {
    assert.equal(bloqueaRutaInstitucional(ruta), true, ruta);
  }
});

test("prendido: el paciente sin sesión va a pedir su enlace, no a un login que no tiene", () => {
  process.env.INSTITUCIONAL = "true";
  for (const ruta of SIN_SESION) {
    assert.equal(destinoSinSesion(ruta), "/acceso/reenviar", ruta);
  }
  // Los operadores y los admins de la instancia SÍ tienen login.
  for (const ruta of ["/admin", "/otorgador", "/admin/padron"]) {
    assert.equal(destinoSinSesion(ruta), "/auth/login", ruta);
  }
});

test("prendido: los rebotes vuelven a la pantalla del paciente, no al dashboard", () => {
  process.env.INSTITUCIONAL = "true";
  assert.equal(rebotePaciente("/dashboard", "/turno/x/acceso"), "/turno/x/acceso");
  assert.equal(rebotePaciente("/auth/login", "/acceso/reenviar"), "/acceso/reenviar");
});

test("prendido: la confirmación de pago rebota a la pantalla propia del paciente", () => {
  process.env.INSTITUCIONAL = "true";
  assert.equal(destinoConfirmacionCI("abc"), "/consulta/abc/acceso");
});

test("prendido: bloquea la ruta exacta y sus hijas, NUNCA un prefijo parecido", () => {
  process.env.INSTITUCIONAL = "true";
  // El acceso del paciente y su sala viven bajo /turno y /acceso: si el
  // bloqueo se comiera un prefijo de más, el paciente institucional quedaría
  // sin poder entrar a su propia consulta.
  for (const ruta of ["/clinicas", "/drone", "/medicosuchoslinda", "/turno/x/acceso", "/acceso/t/abc"]) {
    assert.equal(bloqueaRutaInstitucional(ruta), false, ruta);
  }
});
