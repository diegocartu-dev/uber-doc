// Verificación del motor de resolución (Fase 2) — lógica pura, sin DB.
// Correr: npx tsx scripts/verificar-resolucion-consultas.mts
//
// El proyecto solo tiene Playwright (E2E); este script usa node:assert + tsx
// (patrón ya usado en scripts/) para testear la función pura crítica de plata.

import assert from "node:assert/strict";
import { resolver, type SenalesResolucion } from "../src/lib/resolucion-consultas.ts";

let pasados = 0;
function caso(nombre: string, senales: SenalesResolucion, esperado: ReturnType<typeof resolver>) {
  const r = resolver(senales);
  assert.deepEqual(r, esperado, `❌ ${nombre}\n  esperado: ${JSON.stringify(esperado)}\n  obtenido: ${JSON.stringify(r)}`);
  console.log(`✅ ${nombre}`);
  pasados++;
}

// 1. Paciente no se presentó → no-show, se retiene el pago.
caso(
  "paciente no se presentó → no_show_paciente / retener",
  { pacienteSePresento: false, medicoEntroAlVideo: false, pacienteEntroAlVideo: false, presenciaConfiable: true },
  { motivo: "no_show_paciente", accionPlata: "retener", registrarAusenciaMedico: false }
);

// 2. Presencia NO confiable (aunque parezca médico ausente) → interrumpida + refund, sin penalizar.
caso(
  "presencia no confiable → interrumpida / refund (a favor del paciente, sin penalizar al médico)",
  { pacienteSePresento: true, medicoEntroAlVideo: false, pacienteEntroAlVideo: true, presenciaConfiable: false },
  { motivo: "interrumpida", accionPlata: "refund", registrarAusenciaMedico: false }
);

// 3. EL CASO QUE NOS IMPORTA: paciente presente, presencia confiable, médico nunca entró → médico ausente + refund.
caso(
  "médico nunca entró al video → medico_ausente / refund / registra ausencia",
  { pacienteSePresento: true, medicoEntroAlVideo: false, pacienteEntroAlVideo: true, presenciaConfiable: true },
  { motivo: "medico_ausente", accionPlata: "refund", registrarAusenciaMedico: true }
);

// 4. Médico entró, paciente nunca se conectó al video → interrumpida + refund (no penaliza al médico).
caso(
  "médico entró, paciente no se conectó al video → interrumpida / refund",
  { pacienteSePresento: true, medicoEntroAlVideo: true, pacienteEntroAlVideo: false, presenciaConfiable: true },
  { motivo: "interrumpida", accionPlata: "refund", registrarAusenciaMedico: false }
);

// 5. Ambos estuvieron y se cortó sin retomar → interrumpida + refund.
caso(
  "ambos en el video, cortada y no retomada → interrumpida / refund",
  { pacienteSePresento: true, medicoEntroAlVideo: true, pacienteEntroAlVideo: true, presenciaConfiable: true },
  { motivo: "interrumpida", accionPlata: "refund", registrarAusenciaMedico: false }
);

// Garantía de seguridad de plata: NUNCA se retiene plata salvo no-show explícito del paciente.
for (const presenciaConfiable of [true, false]) {
  for (const medicoEntroAlVideo of [true, false]) {
    for (const pacienteEntroAlVideo of [true, false]) {
      const r = resolver({ pacienteSePresento: true, medicoEntroAlVideo, pacienteEntroAlVideo, presenciaConfiable });
      assert.notEqual(r.accionPlata, "retener", "❌ Con paciente presente NUNCA se debe retener plata");
    }
  }
}
console.log("✅ invariante: con paciente presente nunca se retiene plata");
pasados++;

console.log(`\n${pasados} verificaciones OK.`);
