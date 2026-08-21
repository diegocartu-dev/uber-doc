// Reloj de la CI que nadie aceptó (Diego, 21/08/2026: "10 minutos y listo,
// máximo 2 avisos"). Lo que este test protege es que el pedido no vuelva a
// quedar colgado ni el profesional a recibir mensajes encadenados toda la noche.

import {
  decidir,
  MAX_RECORDATORIOS,
  PLAZO_SIN_ACEPTAR_MIN,
  RECORDATORIO_MIN,
} from "../../src/lib/consultas/liberar-sin-aceptar";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, esperado: unknown) {
  if (actual === esperado) {
    passed++;
    console.log(`✅ ${label}`);
  } else {
    failed++;
    console.log(`❌ ${label} — esperaba ${String(esperado)}, dio ${String(actual)}`);
  }
}

const sinRecordatorios = (minutos: number) => decidir({ minutos, recordatoriosEnviados: 0 });
const conRecordatorio = (minutos: number) => decidir({ minutos, recordatoriosEnviados: 1 });

// ── Los números que fijó Diego ─────────────────────────────────────────────
check("el plazo es de 10 minutos", PLAZO_SIN_ACEPTAR_MIN, 10);
check("el recordatorio sale a los 5", RECORDATORIO_MIN, 5);
check("un solo recordatorio además del aviso inicial", MAX_RECORDATORIOS, 1);

// ── Antes del recordatorio no se molesta a nadie ───────────────────────────
check("recién pedida: esperar", sinRecordatorios(0), "esperar");
check("a los 4 minutos todavía no se avisa", sinRecordatorios(4), "esperar");

// ── El único recordatorio ──────────────────────────────────────────────────
check("a los 5 minutos justos sale el recordatorio", sinRecordatorios(5), "recordar");
check("a los 9 minutos, si nunca salió, sale", sinRecordatorios(9), "recordar");
check("con el recordatorio ya enviado, no se repite", conRecordatorio(6), "esperar");
check("tampoco se repite a los 9", conRecordatorio(9), "esperar");

// ── El corte ───────────────────────────────────────────────────────────────
check("a los 10 minutos justos se libera", sinRecordatorios(10), "liberar");
check("a los 11 se libera", conRecordatorio(11), "liberar");

// Corrida salteada (deploy, outage): el cron encuentra el pedido vencido y sin
// recordatorio. No tiene sentido avisar de algo que se está cerrando: libera.
check("vencida sin recordatorio previo: libera, no avisa", sinRecordatorios(12), "liberar");

// El caso real que originó el sprint: 11 horas colgada. Nunca más "esperar".
check("a las 11 horas se libera", sinRecordatorios(660), "liberar");
check("a las 11 horas nunca se manda un aviso", conRecordatorio(660) !== "recordar", true);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
