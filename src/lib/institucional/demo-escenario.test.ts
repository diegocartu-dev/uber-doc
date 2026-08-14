// Tests del ESCENARIO de la reunión — la parte pura.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// Lo que se fija acá son las tres decisiones que, si salen mal, se ven EN LA
// REUNIÓN: qué rango de fechas se abre, si queda un turno asignable "para
// ahora", y que los pacientes de utilería no puedan leerse como personas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  rangoEscenarioPorDefecto,
  franjaDeAhora,
  franjasEscenario,
  nombreRelleno,
  hoyAR,
  huecoDeHoy,
  mitadDelEscenario,
  bandaOcupada,
  bandaLibre,
  esFinDeSemana,
  FRANJA_MANANA,
  FRANJA_TARDE,
  NOMBRE_RESPALDO,
} from "@/lib/institucional/demo-escenario";

/** El archivo sin comentarios: lo mismo que hace `demo-aislamiento.test.ts`. */
function fuente(ruta: string): string {
  return readFileSync(resolve(process.cwd(), ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ─────────────────────────────────────────────────────────────────────────────
// El rango del guion
// ─────────────────────────────────────────────────────────────────────────────

test("antes del 20 de agosto, el rango arranca HOY y llega igual al 30", () => {
  // Arrancaba el 20, y con eso la Escena 1 no existía: `armarOferta` solo lee
  // slots de la semana AR corriente, así que con una reunión el 13 la
  // intersección con el 20-30 era CERO — y `priorizarOferta` descarta la fila
  // entera de un profesional sin CI, sin slots y sin acuerdo completo, o sea que
  // el participante ni figuraba en la pantalla del call center.
  const { desde, hasta } = rangoEscenarioPorDefecto(new Date("2026-08-13T15:00:00-03:00"));
  assert.equal(desde, "2026-08-13");
  assert.equal(hasta, "2026-08-30");
});

test("el rango SIEMPRE alcanza el domingo de la semana corriente", () => {
  // Es la ventana exacta que mira `armarOferta` (hoy → domingo). Si el rango no
  // la toca, el call center no tiene un solo horario que asignar.
  for (const iso of [
    "2026-08-13T15:00:00-03:00",
    "2026-08-03T09:00:00-03:00",
    "2026-08-25T10:00:00-03:00",
    "2026-09-10T10:00:00-03:00",
    "2026-12-28T10:00:00-03:00",
  ]) {
    const ahora = new Date(iso);
    const { desde, hasta } = rangoEscenarioPorDefecto(ahora);
    const hoy = hoyAR(ahora);
    const d = new Date(hoy + "T12:00:00");
    const diasHastaDomingo = (7 - d.getDay()) % 7;
    const domingo = new Date(d);
    domingo.setDate(domingo.getDate() + diasHastaDomingo);
    const domingoISO = domingo.toISOString().slice(0, 10);
    assert.ok(desde <= domingoISO && hasta >= hoy, `${iso}: el rango no toca la ventana de la oferta`);
  }
});

test("empezada la ventana, arranca HOY y no en el pasado", () => {
  // Un slot de ayer no lo puede asignar nadie: solo ensucia la grilla que se va
  // a proyectar.
  const { desde, hasta } = rangoEscenarioPorDefecto(new Date("2026-08-25T10:00:00-03:00"));
  assert.equal(desde, "2026-08-25");
  assert.equal(hasta, "2026-08-30");
});

test("si la reunión se corrió a septiembre, no abre una agenda vieja", () => {
  // Es preferible una demo con turnos de verdad que una fiel a una fecha que
  // quedó atrás — con el rango de agosto, la agenda saldría vacía entera.
  const { desde, hasta } = rangoEscenarioPorDefecto(new Date("2026-09-10T10:00:00-03:00"));
  assert.equal(desde, "2026-09-10");
  assert.equal(hasta, "2026-09-20");
  assert.ok(hasta > desde);
});

test("el rango nunca arranca antes de hoy, sea cual sea la fecha", () => {
  for (const iso of [
    "2026-01-05T10:00:00-03:00",
    "2026-08-19T23:00:00-03:00",
    "2026-08-30T09:00:00-03:00",
    "2026-12-31T22:00:00-03:00",
  ]) {
    const ahora = new Date(iso);
    const { desde, hasta } = rangoEscenarioPorDefecto(ahora);
    assert.ok(desde >= hoyAR(ahora), `${iso} abrió turnos en el pasado`);
    assert.ok(hasta >= desde, `${iso} dio un rango invertido`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// La franja de hoy: sin esto no hay escena de call center
// ─────────────────────────────────────────────────────────────────────────────

test("la franja de hoy arranca DESPUÉS de la ventana T−5 del otorgador", () => {
  // Si el primer slot naciera pegado a la hora actual, el otorgador no lo
  // podría asignar (filtra los que están a menos de 5 minutos) y la escena
  // "asignale un turno para ahora" se caería con la agenda llena.
  const f = franjaDeAhora(new Date("2026-08-21T13:07:00-03:00"));
  assert.ok(f);
  assert.equal(f!.hora_inicio, "13:30");
  assert.equal(f!.hora_fin, "16:30");
});

test("la franja de hoy no se pasa del cierre de la institución", () => {
  const f = franjaDeAhora(new Date("2026-08-21T18:40:00-03:00"), "20:00");
  assert.ok(f);
  assert.equal(f!.hora_fin, "20:00");
});

test("si ya no queda tiempo útil, no inventa una franja de un minuto", () => {
  assert.equal(franjaDeAhora(new Date("2026-08-21T19:55:00-03:00"), "20:00"), null);
  assert.equal(franjaDeAhora(new Date("2026-08-21T23:30:00-03:00"), "20:00"), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Las franjas del guion y el relleno
// ─────────────────────────────────────────────────────────────────────────────

test("el escenario ocupa UNA banda y deja la otra entera libre", () => {
  // Ocupaba las dos, y `crearAgendaModelo` rechaza cualquier agenda que se pise
  // con turnos disponibles: el participante le pedía a Nova "abrime de 9 a 12" y
  // Nova le contestaba que ya tenía una agenda que se pisa. Delante del ministro.
  for (const mitad of ["mañana", "tarde"] as const) {
    const franjas = franjasEscenario(mitad);
    assert.equal(franjas.length, 5, `${mitad}: tiene que ser una banda por día hábil`);
    assert.deepEqual([...new Set(franjas.map((f) => f.dia_semana))], [1, 2, 3, 4, 5]);
    const ocupada = bandaOcupada(mitad);
    const libre = bandaLibre(mitad);
    for (const f of franjas) {
      assert.equal(f.hora_inicio, ocupada.hora_inicio);
      assert.equal(f.hora_fin, ocupada.hora_fin);
      // La banda libre NO puede quedar tocada por ninguna franja del escenario:
      // es el lugar donde Nova va a crear.
      assert.ok(
        f.hora_fin <= libre.hora_inicio || f.hora_inicio >= libre.hora_fin,
        `${mitad}: el escenario se metió en la banda que tenía que dejar libre`
      );
    }
  }
});

test("la banda que se llena es la mitad del día en la que ocurre la reunión", () => {
  // Si fuera fija, la mitad de las reuniones caería del lado vacío y el call
  // center no tendría un solo turno cerca de la hora para asignar "para ahora".
  assert.equal(mitadDelEscenario(new Date("2026-08-21T10:00:00-03:00")), "mañana");
  assert.equal(mitadDelEscenario(new Date("2026-08-21T16:00:00-03:00")), "tarde");
  assert.equal(bandaOcupada("mañana"), FRANJA_MANANA);
  assert.equal(bandaLibre("mañana"), FRANJA_TARDE);
  assert.equal(bandaOcupada("tarde"), FRANJA_TARDE);
  assert.equal(bandaLibre("tarde"), FRANJA_MANANA);
});

test("una reunión de sábado no se queda con una sola ventana", () => {
  // `armarOferta` solo mira la semana AR corriente: un sábado, la ventana es
  // sábado y domingo. Con franjas de lunes a viernes eso daba CERO slots y toda
  // la escena del call center colgaba de la franja improvisada de "ahora".
  assert.ok(esFinDeSemana("2026-08-22"), "22/08/2026 es sábado");
  assert.ok(esFinDeSemana("2026-08-23"), "23/08/2026 es domingo");
  assert.equal(esFinDeSemana("2026-08-21"), false);

  const conFinde = franjasEscenario("tarde", true);
  assert.equal(conFinde.length, 7);
  assert.deepEqual([...new Set(conFinde.map((f) => f.dia_semana))], [1, 2, 3, 4, 5, 6, 7]);
});

test("los pacientes de relleno se leen como lo que son", () => {
  // El repo es público y la reunión es con un ministerio: un nombre "realista"
  // en la grilla proyectada se lee como un vecino de verdad. Estos no.
  const n = nombreRelleno(3);
  assert.match(n, /demostración/i);
  assert.equal(/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(n), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// El hueco de hoy: la franja pedida menos lo que la agenda ya cubre
// ─────────────────────────────────────────────────────────────────────────────

const AGENDA_HOY = [FRANJA_MANANA, FRANJA_TARDE];

test("la reunión del mediodía recibe el hueco real, no un choque", () => {
  // 13:10 pide 13:30-16:30, que se pisa con la tarde (15:00-18:00).
  // `crearAgendaModelo` cortaba por conflicto y NO creaba NADA — ni siquiera el
  // tramo 13:30-15:00, que estaba libre — mientras la nota decía "quedan los que
  // estaban". A las 13:30 no había ninguno: el próximo era a las 15:00.
  const hueco = huecoDeHoy({ hora_inicio: "13:30", hora_fin: "16:30" }, AGENDA_HOY, 20);
  assert.deepEqual(hueco, { hora_inicio: "13:30", hora_fin: "15:00" });
});

test("si la franja arranca adentro de lo ocupado, el hueco empieza donde termina", () => {
  const hueco = huecoDeHoy({ hora_inicio: "10:15", hora_fin: "13:15" }, AGENDA_HOY, 20);
  assert.deepEqual(hueco, { hora_inicio: "12:00", hora_fin: "13:15" });
});

test("sin nada ocupado, el hueco es la franja entera", () => {
  const f = { hora_inicio: "13:30", hora_fin: "16:30" };
  assert.deepEqual(huecoDeHoy(f, [], 20), f);
});

test("un hueco más chico que un turno no es un hueco", () => {
  // 14:50-15:00 son diez minutos: con slots de 20 no entra ninguno, y crear una
  // franja vacía es peor que no crearla (se ve como agenda y no lo es).
  assert.equal(huecoDeHoy({ hora_inicio: "14:50", hora_fin: "16:30" }, AGENDA_HOY, 20), null);
});

test("sin franja candidata no hay hueco", () => {
  assert.equal(huecoDeHoy(null, AGENDA_HOY, 20), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// El andamio de la escena no se proyecta como andamio
// ─────────────────────────────────────────────────────────────────────────────

test("el profesional de respaldo se llama de forma presentable", () => {
  // Esa fila aparece en la pantalla del call center, al lado del participante y
  // delante de la sala. "(respaldo)" es jerga nuestra: leerla proyectada es ver
  // el truco.
  assert.equal(/respaldo/i.test(NOMBRE_RESPALDO), false, "el nombre volvió a decir 'respaldo'");
  assert.match(NOMBRE_RESPALDO, /demostración/i);
});

test("el respaldo se publica por el motor OFRECIDO, para no salir primero", () => {
  // `priorizarOferta` ordena por categoría antes que por reparto parejo: con
  // 'acordado' y cero asignaciones, el andamio empataba con el participante y el
  // desempate quedaba en el orden alfabético — podía salir PRIMERO justo cuando
  // Diego muestra cómo el call center elige al participante.
  const codigo = fuente("src/lib/institucional/demo-escenario.ts");
  const i = codigo.indexOf("respaldo ${desde} a ${hasta}");
  assert.ok(i > 0, "cambió la forma de asegurarRespaldo: revisá este test");
  assert.match(
    codigo.slice(i, i + 400),
    /canal_origen: "ofrecido"/,
    "el respaldo volvió a publicarse como 'acordado' y puede encabezar la oferta"
  );
});

test("preparar el escenario dos veces no llena el padrón de pacientes de utilería", () => {
  // El botón se toca dos veces siempre: se prepara a la mañana, se ajusta antes
  // de empezar, y alguien lo aprieta de nuevo por las dudas. Cada corrida creaba
  // cuatro cuentas auth y cuatro fichas NUEVAS en el padrón de la provincia.
  const codigo = fuente("src/lib/institucional/demo-escenario.ts");
  assert.match(
    codigo,
    /const faltan = cuantos - sentados/,
    "el relleno dejó de contar lo que ya estaba puesto: vuelve a crear pacientes en cada corrida"
  );
  assert.match(
    codigo,
    /reciclables\.shift\(\)/,
    "el relleno dejó de reutilizar los pacientes de utilería que ya existían"
  );
});
