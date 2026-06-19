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
  { pacienteSePresento: false, medicoEntroAlVideo: false, pacienteEntroAlVideo: false, presenciaConfiable: true, huboCorte: false },
  { motivo: "no_show_paciente", accionPlata: "retener", registrarAusenciaMedico: false }
);

// 2. Presencia NO confiable (aunque parezca médico ausente) → interrumpida + refund, sin penalizar.
caso(
  "presencia no confiable → interrumpida / refund (a favor del paciente, sin penalizar al médico)",
  { pacienteSePresento: true, medicoEntroAlVideo: false, pacienteEntroAlVideo: true, presenciaConfiable: false, huboCorte: true },
  { motivo: "interrumpida", accionPlata: "refund", registrarAusenciaMedico: false }
);

// 3. EL CASO QUE NOS IMPORTA: paciente presente, presencia confiable, médico nunca entró → médico ausente + refund.
caso(
  "médico nunca entró al video → medico_ausente / refund / registra ausencia",
  { pacienteSePresento: true, medicoEntroAlVideo: false, pacienteEntroAlVideo: true, presenciaConfiable: true, huboCorte: false },
  { motivo: "medico_ausente", accionPlata: "refund", registrarAusenciaMedico: true }
);

// 4. Médico entró, paciente nunca se conectó al video → interrumpida + refund (no penaliza al médico).
caso(
  "médico entró, paciente no se conectó al video → interrumpida / refund",
  { pacienteSePresento: true, medicoEntroAlVideo: true, pacienteEntroAlVideo: false, presenciaConfiable: true, huboCorte: false },
  { motivo: "interrumpida", accionPlata: "refund", registrarAusenciaMedico: false }
);

// 5a. Ambos estuvieron y SE CORTÓ sin retomar → interrumpida + refund.
caso(
  "ambos en el video + hubo corte → interrumpida / refund",
  { pacienteSePresento: true, medicoEntroAlVideo: true, pacienteEntroAlVideo: true, presenciaConfiable: true, huboCorte: true },
  { motivo: "interrumpida", accionPlata: "refund", registrarAusenciaMedico: false }
);

// 5b. Ambos estuvieron, SIN corte (consulta transcurrió, no se finalizó limpio) → completada, SIN reembolso.
caso(
  "ambos en el video + sin corte → completada / sin reembolso (NO reembolsar una consulta atendida)",
  { pacienteSePresento: true, medicoEntroAlVideo: true, pacienteEntroAlVideo: true, presenciaConfiable: true, huboCorte: false },
  { motivo: "completada", accionPlata: "ninguna", registrarAusenciaMedico: false }
);

// Garantía de seguridad de plata: NUNCA se retiene plata salvo no-show explícito del paciente.
for (const presenciaConfiable of [true, false]) {
  for (const medicoEntroAlVideo of [true, false]) {
    for (const pacienteEntroAlVideo of [true, false]) {
      for (const huboCorte of [true, false]) {
        const r = resolver({ pacienteSePresento: true, medicoEntroAlVideo, pacienteEntroAlVideo, presenciaConfiable, huboCorte });
        assert.notEqual(r.accionPlata, "retener", "❌ Con paciente presente NUNCA se debe retener plata");
      }
    }
  }
}
console.log("✅ invariante: con paciente presente nunca se retiene plata");
pasados++;

// Garantía clave: una consulta ATENDIDA (ambos presentes, sin corte) NUNCA se reembolsa.
{
  const r = resolver({ pacienteSePresento: true, medicoEntroAlVideo: true, pacienteEntroAlVideo: true, presenciaConfiable: true, huboCorte: false });
  assert.equal(r.accionPlata, "ninguna", "❌ Una consulta atendida sin corte no debe reembolsarse");
  assert.equal(r.motivo, "completada");
}
console.log("✅ invariante: consulta atendida sin corte → completada, sin reembolso");
pasados++;

console.log(`\n${pasados} verificaciones OK.`);
