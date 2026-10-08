// La etiqueta de cada caída: suceso (no suena) vs falla (suena). Diego, 06/10/2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnosticarConsulta, suena } from "./diagnostico";

const ACEPTADA = "2026-10-06T12:00:00Z";
const ev = (x: Record<string, unknown> = {}) => ({
  at: ACEPTADA, seg_aceptada_a_cierre: 600, vio_boton: false, toco_boton: false,
  intento_llego_al_servidor: false, seg_desde_ultimo_latido: null, aviso_whatsapp: null,
  aviso_whatsapp_entrega: null, errores_cliente: 0, ...x,
});
const sinPago = (e: Record<string, unknown> | null, extra: Record<string, unknown> = {}) =>
  diagnosticarConsulta({ estado: "cancelada", aceptada_at: ACEPTADA, resuelta_por: "sistema", resolucion_motivo: "sin_pago_plazo", cierre_evidencia: e === null ? null : ev(e), ...extra });

test("atendida y en curso no suenan", () => {
  assert.equal(diagnosticarConsulta({ estado: "completada", aceptada_at: ACEPTADA }).clase, "atendida");
  assert.equal(diagnosticarConsulta({ estado: "aceptada", aceptada_at: ACEPTADA }).clase, "en_curso");
});

test("a) nadie la aceptó: el aviso al profesional decide si es suceso o falla", () => {
  const base = { estado: "cancelada", resuelta_por: "sistema", resolucion_motivo: "sin_respuesta_plazo" };
  const d = (x: Record<string, unknown>) => diagnosticarConsulta({ ...base, cierre_evidencia: ev(x) });
  assert.equal(d({ aviso_medico: "enviado", aviso_medico_entrega: "read" }).clase, "suceso");
  assert.equal(d({ aviso_medico: "enviado", aviso_medico_entrega: "delivered" }).clase, "suceso");
  assert.equal(d({ aviso_medico: "enviado", aviso_medico_entrega: "undelivered" }).clase, "falla");
  assert.equal(d({ aviso_medico: "sin_celular" }).clase, "falla");
  assert.equal(d({ aviso_medico: null }).clase, "falla");
  assert.equal(d({ aviso_medico: "enviado", aviso_medico_entrega: null }).clase, "sin_datos");
  // Evidencia vieja, sin el campo: no se inventa.
  assert.equal(d({}).clase, "sin_datos");
  assert.equal(diagnosticarConsulta({ ...base, cierre_evidencia: null }).clase, "sin_datos");
});

test("a) el paciente que se retira y el profesional que rechaza son sucesos", () => {
  assert.equal(diagnosticarConsulta({ estado: "cancelada", resuelta_por: "paciente", resolucion_motivo: "retiro_paciente" }).clase, "suceso");
  assert.equal(diagnosticarConsulta({ estado: "cancelada", resuelta_por: "paciente", resolucion_motivo: "cambio_profesional" }).texto, "El paciente eligió a otro profesional");
  assert.equal(diagnosticarConsulta({ estado: "rechazada", resuelta_por: "medico", resolucion_motivo: "cancelo_profesional" }).clase, "suceso");
});

test("c) aceptada sin pagar: si intentó y no pudo, falla — aunque después haya cancelado él", () => {
  assert.equal(sinPago({ rechazo_mp: "cc_rejected_high_risk" }).texto, "Mercado Pago rechazó el pago (cc_rejected_high_risk)");
  assert.equal(sinPago({ rechazo_mp: "cc_rejected_high_risk" }, { resuelta_por: "paciente" }).clase, "falla");
  assert.equal(sinPago(null, { mp_status: "rejected", pago_id: "p1" }).clase, "falla");
  assert.equal(sinPago({ rechazo_docto: "consulta_no_pagable" }).clase, "falla");
  assert.equal(sinPago({ toco_boton: true, intento_llego_al_servidor: false }).clase, "falla");
  assert.equal(sinPago({ toco_boton: true, intento_llego_al_servidor: true, cobro_creado: false }).clase, "falla");
});

test("c) aceptada sin pagar: lo que decidió el paciente se describe y no suena", () => {
  assert.equal(sinPago({ vio_boton: true, toco_boton: true, intento_llego_al_servidor: true, cobro_creado: true }).texto, "El paciente no completó el pago en Mercado Pago");
  assert.equal(sinPago({ vio_boton: true }).texto, "El paciente vio el botón de pago y no lo tocó");
  assert.equal(sinPago({ aviso_whatsapp: "enviado", aviso_whatsapp_entrega: "read" }).clase, "suceso");
  assert.equal(sinPago({}, { resuelta_por: "paciente" }).clase, "suceso");
});

test("c) si canceló el profesional, igual se explica por qué el paciente no pagó", () => {
  assert.equal(sinPago({ aviso_whatsapp: "enviado", aviso_whatsapp_entrega: "read" }, { resuelta_por: "medico" }).texto,
    "El profesional canceló; el paciente leyó el aviso de que lo aceptaron y no volvió a la sala");
  assert.equal(sinPago({}, { resuelta_por: "medico" }).clase, "falla");
  assert.equal(sinPago(null, { resuelta_por: "medico" }).clase, "sin_datos");
  assert.equal(sinPago({ rechazo_mp: "cc_rejected_other_reason" }, { resuelta_por: "medico" }).clase, "falla");
});

test("c) volvió por el link: si le pedimos login y no llegó, es nuestra falla", () => {
  assert.equal(sinPago({ aviso_whatsapp: "enviado", aviso_whatsapp_entrega: "read", llego_sin_sesion: true, sala_abierta: false }).clase, "falla");
  assert.equal(sinPago({ aviso_whatsapp: "enviado", aviso_whatsapp_entrega: "read", llego_con_sesion: true, sala_abierta: false }).clase, "sin_datos");
  // Llegó, la pantalla se abrió y no vio el botón: lo decide lo que sigue (leyó el aviso → suceso).
  assert.equal(sinPago({ aviso_whatsapp: "enviado", aviso_whatsapp_entrega: "read", llego_con_sesion: true, sala_abierta: true }).clase, "suceso");
});

test("c) 'vio el botón' solo si estaba mirando después de la aceptación (caso 08/10)", () => {
  // Última señal 618 s antes del cierre, aceptación 614 s antes: se fue 4 s antes de que lo aceptaran.
  const d = sinPago({ vio_boton: true, seg_desde_ultimo_latido: 618, seg_aceptada_a_cierre: 614, aviso_whatsapp: "enviado", aviso_whatsapp_entrega: "read" });
  assert.equal(d.texto, "El paciente leyó el aviso de que lo aceptaron y no volvió a la sala");
  const mirando = sinPago({ vio_boton: true, seg_desde_ultimo_latido: 300, seg_aceptada_a_cierre: 614 });
  assert.equal(mirando.texto, "El paciente vio el botón de pago y no lo tocó");
});

test("c) aceptada sin pagar: nunca se enteró es nuestra falla", () => {
  assert.equal(sinPago({}).texto, "El paciente nunca se enteró de que lo aceptaron: no estaba en la sala y no se le avisó");
  assert.equal(sinPago({ aviso_whatsapp: "sin_celular" }).clase, "falla");
  assert.equal(sinPago({ aviso_whatsapp: "enviado", aviso_whatsapp_entrega: "undelivered" }).clase, "falla");
  assert.equal(sinPago({ errores_cliente: 2 }).clase, "falla");
  assert.equal(sinPago({ aviso_whatsapp: "enviado", aviso_whatsapp_entrega: null }).clase, "sin_datos");
  assert.equal(sinPago(null).clase, "sin_datos");
});

test("b) pagada y alguien no entró: siempre suena", () => {
  const pagada = { aceptada_at: ACEPTADA, pago_id: "p", mp_status: "approved", resuelta_por: "plazo_30min" };
  assert.equal(diagnosticarConsulta({ estado: "medico_ausente", ...pagada }).clase, "falla");
  assert.equal(diagnosticarConsulta({ estado: "no_show_paciente", ...pagada }).clase, "falla");
});

test("suena: fallas y huecos sí, sucesos no", () => {
  assert.equal(suena({ clase: "falla", texto: "" }), true);
  assert.equal(suena({ clase: "sin_datos", texto: "" }), true);
  assert.equal(suena({ clase: "suceso", texto: "" }), false);
  assert.equal(suena({ clase: "atendida", texto: "" }), false);
});

import { llegadasDespues } from "./evidencia-cierre";
test("llegadas: los robots no cuentan; con y sin sesión se distinguen", () => {
  const r = llegadasDespues([
    { evento: "sala_llegada", metadata: { sesion: false, robot: true } },
    { evento: "sala_llegada", metadata: { sesion: false, robot: false } },
    { evento: "sala_abierta", metadata: {} },
  ]);
  assert.deepEqual(r, { llego_con_sesion: false, llego_sin_sesion: true, sala_abierta: true });
});
