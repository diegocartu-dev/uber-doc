// Texto del término de medicamentos controlados, sin dependencias de servidor:
// lo importan las pantallas (componente TerminoControlados) y el servidor
// (lib/legal/controlados.ts). Si cambia, se sube CONTROLADOS_VERSION y se
// siembra la versión nueva (ver lib/legal/controlados.ts).

export const CONTROLADOS_TIPO = "controlados" as const;
export const CONTROLADOS_VERSION = "controlados_v1" as const;

export const CONTROLADOS_TITULO = "Medicamentos controlados";
export const CONTROLADOS_TEXTO =
  "Por Docto se puede recetar cualquier medicamento, excepto psicotrópicos y estupefacientes (Leyes 19.303 y 17.818). Esos no se recetan por la plataforma.";
export const CONTROLADOS_CASILLA = "Leí y acepto";

/** Lo que se guarda en versiones_textos_legales: título + texto, tal cual se muestra. */
export const CONTROLADOS_TEXTO_COMPLETO = `${CONTROLADOS_TITULO}\n\n${CONTROLADOS_TEXTO}`;
