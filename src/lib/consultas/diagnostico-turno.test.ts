// Turnos pagos que no se atendieron: ausencia (no suena) vs falla (suena). Diego, 06/10/2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnosticarTurno, suena } from "./diagnostico";
import { mejorAviso } from "./evidencia-turno";

const ev = (x: Record<string, unknown> = {}) => ({
  at: "2026-10-06T12:00:00Z", aviso_medico: "enviado", aviso_medico_entrega: "delivered",
  paciente_en_sala: true, paciente_en_video: false, medico_en_video: false, ...x,
});
const pagado = { mp_status: "approved" };

test("atendido, vivo y cancelado por el paciente no suenan", () => {
  assert.equal(diagnosticarTurno({ estado: "completado", ...pagado }, null).clase, "atendida");
  assert.equal(diagnosticarTurno({ estado: "confirmado", ...pagado }, null).clase, "en_curso");
  assert.equal(suena(diagnosticarTurno({ estado: "cancelado_paciente", ...pagado }, null)), false);
});

test("el profesional cancela un turno pago: suena (Diego 06/10)", () => {
  assert.equal(diagnosticarTurno({ estado: "cancelado_medico", ...pagado }, null).clase, "falla");
  assert.equal(diagnosticarTurno({ estado: "cancelado_medico", mp_status: "refunded" }, null).clase, "falla");
  assert.equal(diagnosticarTurno({ estado: "cancelado_medico", mp_status: null }, null).clase, "suceso");
});

test("ausencia del profesional: se describe solo con aviso entregado y paciente presente", () => {
  const d = (x: Record<string, unknown>) => diagnosticarTurno({ estado: "ausente_medico", ...pagado }, ev(x));
  assert.equal(d({}).clase, "suceso");
  assert.equal(d({ aviso_medico_entrega: "read" }).clase, "suceso");
  assert.equal(d({ aviso_medico_entrega: "undelivered" }).clase, "falla");
  assert.equal(d({ aviso_medico: null, aviso_medico_entrega: null }).clase, "falla");
  assert.equal(d({ aviso_medico: "error_twilio", aviso_medico_entrega: null }).clase, "falla");
  assert.equal(d({ aviso_medico_entrega: null }).clase, "sin_datos");
  assert.equal(d({ paciente_en_sala: false }).clase, "sin_datos");
  assert.equal(diagnosticarTurno({ estado: "ausente_medico", ...pagado }, null).clase, "sin_datos");
});

test("ausencia del paciente: estar en la sala y no poder entrar al video es falla", () => {
  const d = (x: Record<string, unknown>) => diagnosticarTurno({ estado: "ausente_paciente", ...pagado }, ev(x));
  assert.equal(d({ paciente_en_sala: true, paciente_en_video: false }).clase, "falla");
  assert.equal(d({ paciente_en_sala: false, medico_en_video: true }).clase, "sin_datos");
  assert.equal(d({ paciente_en_sala: false, medico_en_video: false }).clase, "sin_datos");
});

test("mejorAviso: el que prueba la entrega gana; si no, lo que haya", () => {
  assert.deepEqual(mejorAviso([{ resultado: "enviado", twilio_status: "delivered" }, { resultado: "enviado", twilio_status: "read" }]), { aviso: "enviado", entrega: "read" });
  assert.deepEqual(mejorAviso([{ resultado: "error_twilio", twilio_status: null }]), { aviso: "error_twilio", entrega: null });
  assert.deepEqual(mejorAviso([{ resultado: "throttled", twilio_status: null }, { resultado: "enviado", twilio_status: null }]), { aviso: "enviado", entrega: null });
  assert.deepEqual(mejorAviso([]), { aviso: null, entrega: null });
});
