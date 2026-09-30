// Una sala sin paciente no es una atención.
//
// El caso que motiva todo (29/09/2026): la profesional entró por error a la
// sala de un turno del día siguiente, salió, y el turno quedó "completado" y
// contado como atendido. Después devolvió la plata desde su cuenta de MP y
// Docto solo anotó el estado del pago.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirCierreDeSala, decidirReaccionADevolucion } from "../../src/lib/video/presencia";

// ── Cierre de la sala ───────────────────────────────────────────────────────

test("turno: la sala se cierra y el paciente no entró → vuelve a confirmado", () => {
  const r = decidirCierreDeSala({ tipo: "turno", finalizacionDelMedico: false, presencia: "no_entro" });
  assert.deepEqual(r, { accion: "revertir" });
});

test("turno: el paciente entró → se completa como siempre", () => {
  const r = decidirCierreDeSala({ tipo: "turno", finalizacionDelMedico: false, presencia: "entro" });
  assert.deepEqual(r, { accion: "completar" });
});

test("turno: sin datos de presencia (webhook que no escribió) → no se revierte: 'no sé' no es 'no entró'", () => {
  const r = decidirCierreDeSala({ tipo: "turno", finalizacionDelMedico: false, presencia: "sin_datos" });
  assert.deepEqual(r, { accion: "completar" });
});

test("turno: el profesional tocó Finalizar → se respeta aunque el paciente no haya entrado", () => {
  const r = decidirCierreDeSala({ tipo: "turno", finalizacionDelMedico: true, presencia: "no_entro" });
  assert.deepEqual(r, { accion: "completar" });
});

test("consulta inmediata: no cambia (deuda declarada, la resuelve su propio cron)", () => {
  const r = decidirCierreDeSala({ tipo: "consulta", finalizacionDelMedico: false, presencia: "no_entro" });
  assert.deepEqual(r, { accion: "completar" });
});

// ── Devolución que llega por el webhook de Mercado Pago ─────────────────────

test("devolución que disparó Docto (reintegro_estado escrito) → no es externa", () => {
  for (const reintegro of ["pendiente", "reembolsado", "fee_pendiente"]) {
    const r = decidirReaccionADevolucion({ estado: "cancelado_medico", reintegroEstado: reintegro, presencia: "no_entro", hayEvidencia: false });
    assert.deepEqual(r, { externa: false }, reintegro);
  }
});

test("Docto ya cubrió al paciente por CVU y el profesional devuelve desde MP → posible doble cobro, se avisa y no se toca nada", () => {
  const r = decidirReaccionADevolucion({ estado: "cancelado_paciente", reintegroEstado: "cubierto_docto", presencia: "sin_datos", hayEvidencia: false });
  assert.deepEqual(r, { externa: true, anularAtencion: false, avisar: true, dobleCobro: true });
});

test("el caso real: turno 'completado', el paciente nunca entró, sin evolución ni documentos → se anula y se avisa", () => {
  const r = decidirReaccionADevolucion({ estado: "completado", reintegroEstado: null, presencia: "no_entro", hayEvidencia: false });
  assert.deepEqual(r, { externa: true, anularAtencion: true, avisar: true, dobleCobro: false });
});

test("atención que sí ocurrió (el paciente entró) devuelta desde MP → queda atendida y reembolsada, se avisa", () => {
  const r = decidirReaccionADevolucion({ estado: "completado", reintegroEstado: null, presencia: "entro", hayEvidencia: true });
  assert.deepEqual(r, { externa: true, anularAtencion: false, avisar: true, dobleCobro: false });
});

test("atención vieja sin filas de presencia → no se anula nada aunque no haya evidencia", () => {
  // Anterior al 06/06/2026, o el webhook de presencia no escribió: no se sabe.
  const r = decidirReaccionADevolucion({ estado: "completado", reintegroEstado: null, presencia: "sin_datos", hayEvidencia: false });
  assert.deepEqual(r, { externa: true, anularAtencion: false, avisar: true, dobleCobro: false });
});

test("sin fila del paciente pero con evolución o documentos → la atención existió, no se anula", () => {
  const r = decidirReaccionADevolucion({ estado: "completada", reintegroEstado: null, presencia: "no_entro", hayEvidencia: true });
  assert.deepEqual(r, { externa: true, anularAtencion: false, avisar: true, dobleCobro: false });
});

test("atención viva → nunca se cancela sola, pero se avisa", () => {
  for (const estado of ["confirmado", "en_espera", "en_curso", "pagada", "aceptada"]) {
    const r = decidirReaccionADevolucion({ estado, reintegroEstado: null, presencia: "no_entro", hayEvidencia: false });
    assert.deepEqual(r, { externa: true, anularAtencion: false, avisar: true, dobleCobro: false }, estado);
  }
});

test("estado terminal que Docto mismo resolvió → se marca el reintegro sin avisar (el webhook puede ganarle a la anotación)", () => {
  for (const estado of ["medico_ausente", "ausente_medico", "ausente_paciente", "no_show_paciente", "cancelado_medico", "cancelado_paciente", "cancelada"]) {
    const r = decidirReaccionADevolucion({ estado, reintegroEstado: null, presencia: "sin_datos", hayEvidencia: false });
    assert.deepEqual(r, { externa: true, anularAtencion: false, avisar: false, dobleCobro: false }, estado);
  }
});
