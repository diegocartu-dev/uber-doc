// La versión del texto del consentimiento informado que acepta el paciente.
//
// `consentimientos_informados.texto_version` es la prueba de QUÉ texto aceptó.
// Hay un texto para la teleconsulta médica ("v1") y otro para la atención
// psicológica a distancia ("psi-v1", 13/10/2026): si el psicólogo mostrara el
// suyo y el registro dijera "v1", el registro afirmaría que el paciente aceptó
// el texto médico. Por eso la versión sale de la profesión del profesional de
// la atención, se calcula acá y en ningún otro lado, y el servidor la vuelve a
// calcular al guardar (no confía en la que manda el cliente).
//
// Cuando cambie un texto, sube SU versión ("v2" / "psi-v2"), no la del otro.
// El test de al lado fija el texto de cada versión: cambiarlo sin decidir la
// versión no se puede mergear. "v1" tiene dos redacciones: la del 20/05/2026 y
// la del 13/10/2026, que sumó "o al servicio de emergencias de tu zona" sin
// subir versión (DECISIONES.md, 13/10).

import { profesionDe } from "@/lib/refeps/profesion";

export const VERSION_CONSENTIMIENTO_MEDICO = "v1" as const;
export const VERSION_CONSENTIMIENTO_PSICOLOGIA = "psi-v1" as const;

export type VersionConsentimiento = typeof VERSION_CONSENTIMIENTO_MEDICO | typeof VERSION_CONSENTIMIENTO_PSICOLOGIA;

export function versionConsentimiento(profesion: string | null | undefined): VersionConsentimiento {
  return profesionDe(profesion) === "psicologo" ? VERSION_CONSENTIMIENTO_PSICOLOGIA : VERSION_CONSENTIMIENTO_MEDICO;
}

export function esVersionConsentimientoValida(v: unknown): v is VersionConsentimiento {
  return v === VERSION_CONSENTIMIENTO_MEDICO || v === VERSION_CONSENTIMIENTO_PSICOLOGIA;
}
