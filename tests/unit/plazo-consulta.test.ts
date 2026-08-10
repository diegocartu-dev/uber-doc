// Plazo de 30 minutos de la consulta inmediata.
//
// Lo que se testea acá decide plata: si el ancla del reloj está mal, se cierran
// consultas recién pagadas; si la condición de "médico ocupado" no se respeta,
// se le marca ausencia a alguien que está atendiendo.

import { momentoDePago, PLAZO_CI_MIN } from "../../src/lib/consultas/resolver-vencidas";

let passed = 0;
let failed = 0;

function check(label: string, real: unknown, esperado: unknown) {
  if (Object.is(real, esperado)) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} — got ${JSON.stringify(real)}, expected ${JSON.stringify(esperado)}`);
  }
}

const PAGO = "2026-08-09T15:00:00.000Z";
const ACEPTADA = "2026-08-09T14:30:00.000Z";
const CREADA = "2026-08-09T14:00:00.000Z";

check("el plazo es de 30 minutos", PLAZO_CI_MIN, 30);

// ── El ancla ───────────────────────────────────────────────────────────────
// Esto es lo que estaba en juego: la consulta se CREA cuando el paciente la
// solicita, y entre eso y el pago puede pasar un rato largo esperando que el
// profesional acepte. Anclar en `created_at` haría vencer consultas recién
// pagadas — y en este ejemplo, una pagada hace 0 minutos ya estaría "vencida"
// por una hora.
check(
  "manda el momento del pago",
  momentoDePago({ mp_payment_created_at: PAGO, aceptada_at: ACEPTADA, created_at: CREADA }),
  new Date(PAGO).getTime()
);
check(
  "sin pago cae a la aceptación, no a la creación",
  momentoDePago({ mp_payment_created_at: null, aceptada_at: ACEPTADA, created_at: CREADA }),
  new Date(ACEPTADA).getTime()
);
check(
  "sin pago ni aceptación cae a la creación",
  momentoDePago({ mp_payment_created_at: null, aceptada_at: null, created_at: CREADA }),
  new Date(CREADA).getTime()
);
check(
  "sin ninguna fecha no vence nada",
  Number.isNaN(momentoDePago({ mp_payment_created_at: null, aceptada_at: null, created_at: null })),
  true
);
check(
  "una fecha corrupta no rompe la corrida",
  Number.isNaN(momentoDePago({ mp_payment_created_at: "no-es-fecha", aceptada_at: null, created_at: null })),
  true
);
// Una fecha basura no puede tapar a la buena que viene atrás.
check(
  "una fecha corrupta cede a la siguiente válida",
  momentoDePago({ mp_payment_created_at: "no-es-fecha", aceptada_at: ACEPTADA, created_at: CREADA }),
  new Date(ACEPTADA).getTime()
);

// ── La ventana ─────────────────────────────────────────────────────────────
const plazoMs = PLAZO_CI_MIN * 60 * 1000;
const pagoMs = new Date(PAGO).getTime();
const vencida = (ahora: number) => ahora >= pagoMs + plazoMs;

check("a los 29 minutos todavía no vence", vencida(pagoMs + 29 * 60 * 1000), false);
check("a los 30 minutos justos vence", vencida(pagoMs + 30 * 60 * 1000), true);
check("a los 31 minutos vence", vencida(pagoMs + 31 * 60 * 1000), true);
check("recién pagada no vence", vencida(pagoMs), false);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
