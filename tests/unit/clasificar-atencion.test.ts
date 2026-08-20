// La escalera Intento → Consulta.
//
// Los casos de abajo no son inventados: son las formas que toman las filas
// reales en producción. Sirven de golden — si alguien cambia la clasificación,
// estos casos dicen qué se movió.
//
// El caso que motiva todo: un paciente pide un profesional, no lo acepta nadie,
// y se va para no volver. En el tablero viejo esa fila figuraba igual que una
// consulta atendida —"cancelada"— y por eso no la veía nadie.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clasificarAtencion,
  clasificarTurno,
  esConsulta,
  esAtencionReal,
  MOTIVO,
} from "../../src/lib/consultas/clasificar";

test("sin aceptar y sin nadie que la cierre: es un intento sin respuesta", () => {
  // Caso real del 18/08 22:09: pidió, no hubo pago ni sala, no volvió nunca.
  const c = clasificarAtencion({ estado: "cancelada" });
  assert.equal(c.nivel, "intento");
  assert.equal(c.desenlace, "sin_respuesta");
  assert.equal(c.fueAceptada, false);
  assert.equal(esConsulta({ estado: "cancelada" }), false);
});

test("el paciente que se retira antes de que lo acepten no es una falla nuestra", () => {
  const c = clasificarAtencion({
    estado: "cancelada",
    resuelta_por: "paciente",
    resolucion_motivo: MOTIVO.RETIRO_PACIENTE,
  });
  assert.equal(c.nivel, "intento");
  assert.equal(c.desenlace, "retirado");
});

test("irse a pedirle a otro profesional también es retirarse, no una falla", () => {
  // Regla del Uber: impaga con OTRO profesional se puede abandonar.
  const c = clasificarAtencion({
    estado: "cancelada",
    resuelta_por: "paciente",
    resolucion_motivo: MOTIVO.CAMBIO_PROFESIONAL,
  });
  assert.equal(c.desenlace, "retirado");
});

test("si la cerró el profesional sin haberla aceptado, NO cuenta como que el paciente se fue", () => {
  const c = clasificarAtencion({
    estado: "cancelada",
    resuelta_por: "medico",
    resolucion_motivo: MOTIVO.CANCELO_PROFESIONAL,
  });
  assert.equal(c.nivel, "intento");
  assert.equal(c.desenlace, "sin_respuesta");
});

test("aceptada y sin pagar: ya es una consulta, con desenlace abandono", () => {
  const fila = { estado: "cancelada", aceptada_at: "2026-08-19T10:00:00Z" };
  const c = clasificarAtencion(fila);
  assert.equal(c.nivel, "consulta");
  assert.equal(c.desenlace, "abandono");
  assert.equal(c.origenAceptacion, "hito");
  // Cuenta como consulta, pero NO como atención real: no hubo plata ni atención.
  assert.equal(esConsulta(fila), true);
  assert.equal(esAtencionReal(fila), false);
});

test("completada es una atención de verdad", () => {
  const fila = {
    estado: "completada",
    aceptada_at: "2026-08-19T10:00:00Z",
    mp_status: "approved",
    pago_id: "p1",
    sala_video_url: "https://sala",
  };
  const c = clasificarAtencion(fila);
  assert.equal(c.nivel, "consulta");
  assert.equal(c.desenlace, "atendida");
  assert.equal(c.fuePagada, true);
  assert.equal(esAtencionReal(fila), true);
});

test("pagada y cancelada por el profesional: el profesional no sostuvo", () => {
  const c = clasificarAtencion({
    estado: "cancelada",
    aceptada_at: "2026-08-19T10:00:00Z",
    mp_status: "approved",
    pago_id: "p1",
    resuelta_por: "medico",
    resolucion_motivo: MOTIVO.CANCELO_PROFESIONAL,
  });
  assert.equal(c.desenlace, "medico_se_fue");
});

test("pagada y cancelada por el paciente: el paciente no llegó", () => {
  const c = clasificarAtencion({
    estado: "cancelada",
    aceptada_at: "2026-08-19T10:00:00Z",
    mp_status: "approved",
    pago_id: "p1",
    resuelta_por: "paciente",
  });
  assert.equal(c.desenlace, "paciente_se_fue");
});

test("los estados del enum que nunca se usaron ya quedan clasificados", () => {
  const base = { aceptada_at: "2026-08-19T10:00:00Z", mp_status: "approved", pago_id: "p1" };
  assert.equal(clasificarAtencion({ ...base, estado: "medico_ausente" }).desenlace, "medico_se_fue");
  assert.equal(clasificarAtencion({ ...base, estado: "no_show_paciente" }).desenlace, "paciente_se_fue");
});

test("una atención viva no se cuenta como fracaso ni como éxito", () => {
  for (const estado of ["esperando", "aceptada", "pagada", "en_curso"]) {
    assert.equal(clasificarAtencion({ estado }).desenlace, "en_progreso", estado);
  }
  // Y el nivel sí cambia según haya aparecido un profesional.
  assert.equal(clasificarAtencion({ estado: "esperando" }).nivel, "intento");
  assert.equal(
    clasificarAtencion({ estado: "en_curso", aceptada_at: "2026-08-19T10:00:00Z" }).nivel,
    "consulta"
  );
});

test("una consulta cobrada y reembolsada SÍ fue pagada", () => {
  // El caso real del 01/08: se cobró, el cobro estuvo mal, se devolvió. Tratar
  // `refunded` como "no pagó" la clasificaría como abandono — lo contrario de
  // lo que pasó. Y sin registro de quién la cerró no se inventa un culpable.
  const fila = { estado: "cancelada", pago_id: "p1", mp_status: "refunded", sala_video_url: "s" };
  const c = clasificarAtencion(fila);
  assert.equal(c.fuePagada, true);
  assert.equal(c.desenlace, "sin_datos");
  // Tuvo plata: no se descuenta de las atenciones reales.
  assert.equal(esAtencionReal(fila), true);
});

test("una cancelación paga registrada NO cae en sin_datos", () => {
  // Hacia adelante siempre hay `resuelta_por`, así que sin_datos sólo aparece
  // en filas anteriores al registro.
  const c = clasificarAtencion({
    estado: "cancelada",
    aceptada_at: "2026-08-19T10:00:00Z",
    mp_status: "refunded",
    pago_id: "p1",
    resuelta_por: "medico",
    resolucion_motivo: MOTIVO.CANCELO_PROFESIONAL,
  });
  assert.equal(c.desenlace, "medico_se_fue");
});

test("plata en camino todavía no es plata adentro", () => {
  // in_process / authorized / pending: MP no acreditó. No cuenta como pagada.
  for (const mp of ["in_process", "authorized", "pending"]) {
    const c = clasificarAtencion({ estado: "cancelada", aceptada_at: "x", mp_status: mp, pago_id: "p" });
    assert.equal(c.fuePagada, false, mp);
    assert.equal(c.desenlace, "abandono", mp);
  }
});

test("filas viejas: el pago y la sala prueban que hubo aceptación", () => {
  // Ninguna consulta anterior al 19/08/2026 tiene `aceptada_at` — se escribió
  // por primera vez el 19/08/2026. Sin este fallback, toda consulta anterior
  // se contaría como un intento.
  const porPago = clasificarAtencion({ estado: "completada", pago_id: "p1", mp_status: "approved" });
  assert.equal(porPago.fueAceptada, true);
  assert.equal(porPago.origenAceptacion, "inferido");
  assert.equal(porPago.desenlace, "atendida");

  const porSala = clasificarAtencion({ estado: "completada", sala_video_url: "https://sala" });
  assert.equal(porSala.origenAceptacion, "inferido");
  assert.equal(porSala.nivel, "consulta");
});

test("el histórico sin hito queda marcado como no distinguible", () => {
  // Fila vieja, cancelada, sin pago ni sala: puede ser "no la aceptó nadie" o
  // "la aceptaron y no pagó", y no hay forma de saberlo. Cae en sin_respuesta
  // con origenAceptacion "no" — el reporte usa ese campo para avisar que el
  // dato es una inferencia, no un hecho.
  const c = clasificarAtencion({ estado: "cancelada" });
  assert.equal(c.origenAceptacion, "no");
  assert.equal(c.desenlace, "sin_respuesta");
});

test("las formas reales de una cancelación caen donde deben", () => {
  const reales = [
    // 18/08 — pidió, nadie la aceptó, no volvió.
    { fila: { estado: "cancelada" }, esperado: "sin_respuesta" },
    // 14/08 — segundo pedido del día, sin sala.
    { fila: { estado: "cancelada" }, esperado: "sin_respuesta" },
    // 07/08 — se fue con otra profesional y ahí sí se atendió.
    { fila: { estado: "cancelada" }, esperado: "sin_respuesta" },
    // 04/08 — pidió, nadie la aceptó, no volvió.
    { fila: { estado: "cancelada" }, esperado: "sin_respuesta" },
    // 01/08 — pagada, reembolsada, rehecha con la misma profesional.
    {
      fila: { estado: "cancelada", sala_video_url: "https://sala", pago_id: "p", mp_status: "refunded" },
      esperado: "sin_datos",
    },
    // 24/07 — pidió, nadie la aceptó, no volvió.
    { fila: { estado: "cancelada" }, esperado: "sin_respuesta" },
  ];
  for (const { fila, esperado } of reales) {
    assert.equal(clasificarAtencion(fila).desenlace, esperado, JSON.stringify(fila));
  }
  // Las que nadie aceptó ni siquiera llegan a ser consultas.
  const intentos = reales.filter((r) => !esConsulta(r.fila)).length;
  assert.equal(intentos, reales.length - 1);
});

// ── TURNOS ───────────────────────────────────────────────────────────────────
// El turno no tiene aceptación: la agenda publicada ES la aceptación. Lo que
// separa el intento de la consulta acá es el pago.

test("turno sin pagar es un intento, no una consulta", () => {
  const c = clasificarTurno({ estado: "reservado_pendiente" });
  assert.equal(c.nivel, "intento");
  assert.equal(c.desenlace, "en_progreso");
});

test("turno pagado y atendido es una consulta", () => {
  const c = clasificarTurno({ estado: "completado", mp_status: "approved" });
  assert.equal(c.nivel, "consulta");
  assert.equal(c.desenlace, "atendida");
});

test("el turno ya distingue quién lo dejó caer: se traduce, no se deduce", () => {
  const pago = { mp_status: "approved" };
  assert.equal(clasificarTurno({ ...pago, estado: "ausente_paciente" }).desenlace, "paciente_se_fue");
  assert.equal(clasificarTurno({ ...pago, estado: "ausente_medico" }).desenlace, "medico_se_fue");
  assert.equal(clasificarTurno({ ...pago, estado: "cancelado_medico" }).desenlace, "medico_se_fue");
  assert.equal(clasificarTurno({ ...pago, estado: "cancelado_paciente" }).desenlace, "paciente_se_fue");
});

test("turno que el profesional cancela antes de que se pague: falla nuestra, no del paciente", () => {
  const c = clasificarTurno({ estado: "cancelado_medico" });
  assert.equal(c.nivel, "intento");
  assert.equal(c.desenlace, "sin_respuesta");
});

test("turno pagado y todavía en camino no se cuenta como fracaso", () => {
  for (const estado of ["confirmado", "en_espera", "en_curso", "reprogramado"]) {
    const c = clasificarTurno({ estado, mp_status: "approved" });
    assert.equal(c.nivel, "consulta", estado);
    assert.equal(c.desenlace, "en_progreso", estado);
  }
});

test("un turno reembolsado sigue contando como pagado", () => {
  // Mismo criterio que en las consultas: para devolver la plata, primero entró.
  const c = clasificarTurno({ estado: "ausente_paciente", mp_status: "refunded" });
  assert.equal(c.fuePagada, true);
  assert.equal(c.nivel, "consulta");
});

test("la solicitud que libera el sistema por plazo es una falla de oferta", () => {
  // Cierra el ciclo con `lib/consultas/sin-respuesta.ts`: lo que escribe ese
  // módulo tiene que caer en `sin_respuesta`, no en "el paciente se retiró".
  // Si alguien cambia el motivo o el `resuelta_por`, este test lo caza.
  const c = clasificarAtencion({
    estado: "cancelada",
    resuelta_por: "sistema",
    resolucion_motivo: MOTIVO.SIN_RESPUESTA,
  });
  assert.equal(c.nivel, "intento");
  assert.equal(c.desenlace, "sin_respuesta");
  assert.equal(esConsulta({ estado: "cancelada", resuelta_por: "sistema" }), false);
});
