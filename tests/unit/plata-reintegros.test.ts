// Lo devuelto no es plata cobrada (decisión Diego, 09/08/2026).
//
// El bug: un refund de Mercado Pago NO toca `mp_status` — el pago queda
// `approved` y la devolución se registra aparte, en `reintegro_estado`. Como el
// tablero definía "cobrado" mirando solo `mp_status`, la plata devuelta seguía
// figurando como ingreso.

import {
  aprobada,
  cobradoDe,
  conMovimiento,
  comisionTotalDe,
  pagada,
  reintegrada,
  reintegradoDe,
  reintegroEnCurso,
  reintegroEnCursoDe,
  reintegrosPorCausa,
  causaEnCriollo,
  type FilaPago,
} from "../../src/lib/insights/plata";

let passed = 0;
let failed = 0;

function check(label: string, real: unknown, esperado: unknown) {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}\n  got      ${a}\n  expected ${b}`);
  }
}

const fila = (over: Partial<FilaPago>): FilaPago => ({
  monto: 30000,
  mp_status: "approved",
  mp_application_fee: 1500,
  comision_docto_pct: 5,
  reintegro_estado: null,
  resolucion_motivo: null,
  ...over,
});

const cobrada = fila({});
// Así queda una devolución REAL en producción: el webhook de MP mueve
// `mp_status` de "approved" a "refunded". Detectarla solo por
// `reintegro_estado` la dejaba afuera de todos los cortes.
const devuelta = fila({ monto: 50000, mp_status: "refunded", reintegro_estado: "reembolsado", resolucion_motivo: "medico_ausente" });
const devuelta2 = fila({ monto: 20000, mp_status: "refunded", reintegro_estado: "reembolsado", resolucion_motivo: "cancelado_paciente" });
// Devolución ejecutada cuyo webhook NUNCA llegó: `mp_status` quedó viejo.
const devueltaSinWebhook = fila({ monto: 15000, mp_status: "approved", reintegro_estado: "reembolsado", resolucion_motivo: "medico_ausente" });
// Devolución que MP confirmó pero nuestro motor no llegó a anotar.
const devueltaSoloMp = fila({ monto: 8000, mp_status: "refunded", reintegro_estado: null, resolucion_motivo: "cancelado_medico" });
const enCurso = fila({ monto: 10000, reintegro_estado: "pendiente", resolucion_motivo: "medico_ausente" });
const rechazada = fila({ monto: 99999, mp_status: "rejected" });

// ── Clasificación ──────────────────────────────────────────────────────────
check("una cobrada cuenta como pagada", pagada(cobrada), true);
check("una devuelta NO cuenta como pagada", pagada(devuelta), false);
// Ojo: una devuelta ya NO es "aprobada" — MP le movió el estado a "refunded".
// Por eso el universo de los cortes es `conMovimiento`, no `aprobada`.
check("una devuelta deja de estar aprobada", aprobada(devuelta), false);
check("un reintegro en curso todavía cuenta como cobrado", pagada(enCurso), true);
check("y se marca como en curso", reintegroEnCurso(enCurso), true);
check("un reintegro concretado no está 'en curso'", reintegroEnCurso(devuelta), false);
check("un pago rechazado nunca fue cobrado", pagada(rechazada), false);
check("se detecta el reintegro por mp_status refunded", reintegrada(devuelta), true);
check("y también cuando el webhook nunca llegó", reintegrada(devueltaSinWebhook), true);
check("y cuando MP lo confirmó pero no lo anotamos", reintegrada(devueltaSoloMp), true);
check("una devuelta sin webhook NO cuenta como cobrada", pagada(devueltaSinWebhook), false);

// El universo de cualquier corte de plata: lo cobrado Y lo devuelto.
check("una cobrada movió plata", conMovimiento(cobrada), true);
check("una devuelta también movió plata", conMovimiento(devuelta), true);
check("un rechazado no movió nada", conMovimiento(rechazada), false);

// ── Totales: EL bug ────────────────────────────────────────────────────────
const filas = [cobrada, devuelta, devuelta2, devueltaSinWebhook, devueltaSoloMp, enCurso, rechazada];

// Con la regla vieja (solo mp_status) esto habría dado 110.000: los 30.000
// cobrados + 70.000 ya devueltos + 10.000 en curso.
check("el cobrado deja afuera lo devuelto", cobradoDe(filas), 30000 + 10000);
check("lo devuelto se informa aparte", reintegradoDe(filas), 50000 + 20000 + 15000 + 8000);
check("lo que está por devolverse, también", reintegroEnCursoDe(filas), 10000);
check("la comisión tampoco cuenta sobre lo devuelto", comisionTotalDe(filas), 1500 + 1500);

// ── El corte por causa ─────────────────────────────────────────────────────
check("los reintegros se agrupan por causa, de mayor a menor", reintegrosPorCausa(filas), [
  { causa: "El profesional no llegó a atender", motivo: "medico_ausente", cantidad: 2, monto: 65000 },
  { causa: "Lo canceló el paciente", motivo: "cancelado_paciente", cantidad: 1, monto: 20000 },
  { causa: "Lo canceló el profesional", motivo: "cancelado_medico", cantidad: 1, monto: 8000 },
]);

check("varias de la misma causa se suman", reintegrosPorCausa([devuelta, fila({ monto: 5000, mp_status: "refunded", reintegro_estado: "reembolsado", resolucion_motivo: "medico_ausente" })]), [
  { causa: "El profesional no llegó a atender", motivo: "medico_ausente", cantidad: 2, monto: 55000 },
]);

check("sin reintegros la lista viene vacía", reintegrosPorCausa([cobrada, rechazada]), []);

// Un reintegro sin causa registrada no se esconde: se muestra diciendo que falta.
check("una causa faltante se nombra, no se oculta", causaEnCriollo(null), "Sin causa registrada");
check("una causa desconocida se muestra cruda antes que perderla", causaEnCriollo("motivo_nuevo"), "motivo_nuevo");
check(
  "un reintegro sin causa igual aparece en el corte",
  reintegrosPorCausa([fila({ monto: 7000, mp_status: "refunded", reintegro_estado: "reembolsado" })]),
  [{ causa: "Sin causa registrada", motivo: "", cantidad: 1, monto: 7000 }]
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
