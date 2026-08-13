// Tests de LO QUE VE el paciente institucional — runner: node:test + node:assert
// con tsx.  Ejecutar:
//   npx tsx --test src/lib/institucional/pantalla-turno.test.ts
//
// Fija dos cosas que, si se rompen, se rompen en silencio y del lado del
// paciente (que no tiene a quién reportarlo salvo el 0800):
//   1. Qué estado del mock se muestra para cada estado de turno y cada momento
//      del reloj — incluido el default: un estado desconocido NO inventa
//      pantalla, muestra "enlace inactivo".
//   2. Que el reenvío self-service respete el cooldown y el techo diario, y
//      que elija el turno correcto (el próximo; si no hay, el último dentro de
//      la vigencia de documentos).
//
// Datos 100 % sintéticos.

process.env.INSTITUCIONAL = "true";

import { test } from "node:test";
import assert from "node:assert/strict";
import { pantallaDelTurno, abreLaPuertaMs, instanteAR } from "./pantalla-turno";
import { permiteReenvio, elegirTurnoParaReenvio } from "./reenvio";

const INICIO = instanteAR("2026-10-20", "17:00:00");
const FIN = instanteAR("2026-10-20", "17:15:00");
const VENTANA = 10; // minutos, el default del config

function pantalla(estado: string, ahoraMs: number) {
  return pantallaDelTurno({
    estado,
    inicioMs: INICIO,
    finMs: FIN,
    ahoraMs,
    ventanaEntradaMin: VENTANA,
  });
}

// ─── Los seis estados ────────────────────────────────────────────────────────

test("A — falta para el turno: una hora antes no se puede entrar", () => {
  assert.equal(pantalla("confirmado", INICIO - 60 * 60_000), "falta");
});

test("A → B — la puerta abre exactamente en inicio menos la ventana del config", () => {
  assert.equal(pantalla("confirmado", INICIO - VENTANA * 60_000 - 1), "falta");
  assert.equal(pantalla("confirmado", INICIO - VENTANA * 60_000), "ventana");
  assert.equal(abreLaPuertaMs(INICIO, VENTANA), INICIO - 10 * 60_000);
});

test("B — el turno empezó y el profesional todavía no abrió: sigue pudiendo entrar", () => {
  // Llegar tarde (o que el profesional se demore) NO cierra la puerta.
  assert.equal(pantalla("confirmado", FIN + 20 * 60_000), "ventana");
});

test("D — ya está en la sala de espera", () => {
  assert.equal(pantalla("en_espera", INICIO), "espera");
});

test("el profesional abrió la sala: no es una pantalla, es irse al video", () => {
  assert.equal(pantalla("en_curso", INICIO), "sala");
});

test("E — terminados: el enlace sigue sirviendo para los documentos", () => {
  for (const estado of ["completado", "ausente_paciente", "ausente_medico"]) {
    assert.equal(pantalla(estado, FIN + 5 * 24 * 3600_000), "terminado", estado);
  }
});

test("F — reprogramado o cancelado: el enlace viejo no lleva a ningún lado", () => {
  for (const estado of ["reprogramado", "cancelado_paciente", "cancelado_medico"]) {
    assert.equal(pantalla(estado, INICIO), "inactivo", estado);
  }
});

test("F — un slot que volvió a estar libre ya no es de este paciente", () => {
  assert.equal(pantalla("disponible", INICIO), "inactivo");
  assert.equal(pantalla("bloqueado", INICIO), "inactivo");
});

test("un estado desconocido NO inventa pantalla: cae en 'inactivo'", () => {
  // Fail-safe: si mañana aparece un estado nuevo, el paciente ve "pedí un
  // enlace nuevo" en vez de una pantalla adivinada.
  assert.equal(pantalla("estado_que_no_existe", INICIO), "inactivo");
  assert.equal(pantalla("reservado_pendiente", INICIO), "inactivo");
});

test("instanteAR interpreta la hora como hora de Argentina", () => {
  // 17:00 AR = 20:00 UTC.
  assert.equal(new Date(instanteAR("2026-10-20", "17:00:00")).toISOString(), "2026-10-20T20:00:00.000Z");
  assert.equal(instanteAR("2026-10-20", "17:00"), instanteAR("2026-10-20", "17:00:00"));
});

// ─── Reenvío self-service ────────────────────────────────────────────────────

const AHORA = instanteAR("2026-10-20", "12:00:00");
const MIN = 60_000;

test("reenvío: sin pedidos previos, se puede", () => {
  assert.equal(permiteReenvio([], AHORA, 10, 5), true);
});

test("reenvío: dentro del cooldown, no", () => {
  assert.equal(permiteReenvio([AHORA - 9 * MIN], AHORA, 10, 5), false);
  assert.equal(permiteReenvio([AHORA - 10 * MIN], AHORA, 10, 5), true);
});

test("reenvío: el techo diario corta aunque el cooldown haya pasado", () => {
  const cinco = [1, 2, 3, 4, 5].map((h) => AHORA - h * 60 * MIN);
  assert.equal(permiteReenvio(cinco, AHORA, 10, 5), false);
  assert.equal(permiteReenvio(cinco, AHORA, 10, 6), true);
});

test("reenvío: los pedidos de hace más de un día no cuentan para el techo", () => {
  const viejos = [26, 27, 28, 29, 30].map((h) => AHORA - h * 60 * MIN);
  assert.equal(permiteReenvio(viejos, AHORA, 10, 5), true);
});

const turno = (id: string, fecha: string, hora: string, estado: string) => ({
  id,
  fecha,
  hora_inicio: hora,
  medico_id: "00000000-0000-0000-0000-000000000000",
  estado,
});

test("reenvío: manda al próximo turno vivo, no al más viejo", () => {
  const elegido = elegirTurnoParaReenvio(
    [
      turno("t-lejano", "2026-10-25", "09:00:00", "confirmado"),
      turno("t-proximo", "2026-10-20", "17:00:00", "confirmado"),
      turno("t-pasado", "2026-10-01", "09:00:00", "completado"),
    ],
    AHORA,
    30,
    instanteAR
  );
  assert.equal(elegido?.id, "t-proximo");
});

test("reenvío: sin turnos vivos, manda al último terminado dentro de la vigencia", () => {
  const elegido = elegirTurnoParaReenvio(
    [
      turno("t-viejo", "2026-08-01", "09:00:00", "completado"),
      turno("t-reciente", "2026-10-15", "09:00:00", "completado"),
    ],
    AHORA,
    30,
    instanteAR
  );
  assert.equal(elegido?.id, "t-reciente");
});

test("reenvío: un turno terminado FUERA de la vigencia ya no se reenvía", () => {
  const elegido = elegirTurnoParaReenvio(
    [turno("t-viejisimo", "2026-01-05", "09:00:00", "completado")],
    AHORA,
    30,
    instanteAR
  );
  assert.equal(elegido, null);
});

test("reenvío: un turno cancelado no es destino de nada", () => {
  const elegido = elegirTurnoParaReenvio(
    [turno("t-cancelado", "2026-10-21", "09:00:00", "cancelado_medico")],
    AHORA,
    30,
    instanteAR
  );
  assert.equal(elegido, null);
});
