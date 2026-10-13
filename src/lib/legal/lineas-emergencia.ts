// Emergencias: el remate que llevan los textos de Docto (consentimiento,
// términos, pantallas).
//
// Regla de Diego (13/10/2026): Docto no atiende emergencias en ninguna
// especialidad. Los textos NUEVOS no publican números de teléfono (no sabemos
// si están actualizados); los que ya estaban publicados (107 / 911) se quedan,
// y TODO texto de emergencias remite además al servicio de emergencias de la
// zona del paciente o a la guardia más cercana.
//
// Los textos nuevos en voseo usan REMITIR_EMERGENCIAS tal cual. Los que ya
// tenían un número (triage, consentimiento médico) o van en tercera persona
// (§2.2 de los términos del paciente) llevan su propia redacción, pero siempre
// con "servicio de emergencias de tu/su zona": lo controla
// tests/unit/emergencias-zona.test.ts.

/** El remate que cierra cualquier frase de emergencias (sin números). */
export const REMITIR_EMERGENCIAS =
  "comunicate con el servicio de emergencias de tu zona o dirigite a la guardia más cercana" as const;

/** La frase completa, para donde va sola. */
export const TEXTO_EMERGENCIAS =
  `Docto no atiende emergencias. Ante una emergencia, una urgencia o una crisis, ${REMITIR_EMERGENCIAS}.` as const;
