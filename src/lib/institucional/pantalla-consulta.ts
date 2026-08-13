// src/lib/institucional/pantalla-consulta.ts
// Qué ve el paciente institucional cuando entra por el link de una CONSULTA
// INMEDIATA — parte PURA. Hermana de `pantalla-turno.ts`.
//
// ── EL AGUJERO QUE ESTO TAPA ─────────────────────────────────────────────────
// El turno tuvo su pantalla propia desde la Etapa 3; la consulta inmediata no.
// El link de una CI aterrizaba en `/consulta/[id]/confirmacion`, que es el clon
// del B2C: barra con el logo de Docto, copy de pagos que en la instancia no
// existen, y links a `/documentos` y `/mis-consultas` que además dan 404
// porque el modo institucional los bloquea. O sea: la pantalla equivocada, con
// la marca equivocada, y con botones que no llevaban a ningún lado. Estaba
// declarado como pendiente al cerrar la Etapa 3 (§11.19); esto lo cierra.
//
// ── POR QUÉ NO SE REUSA `pantallaDelTurno` ───────────────────────────────────
// Porque los estados NO son los mismos y hacerlos pasar por la misma función
// obligaría a un mapeo de estados en el llamador — justo el tipo de traducción
// que después se escribe distinto en dos lugares. La CI no tiene fecha ni
// ventana de entrada (es AHORA), y sus terminales tienen otros nombres
// (`no_show_paciente`, `medico_ausente`). Lo que sí se comparte es lo que
// importa: el vocabulario de pantallas y el layout del mock.

/**
 * Mismo vocabulario que el turno, menos "falta" (la CI no espera a ninguna
 * hora: o se puede entrar, o ya terminó).
 */
export type PantallaConsulta =
  | "ventana"
  | "espera"
  | "sala"
  | "terminado"
  | "ausente-profesional"
  | "ausente-paciente"
  | "inactivo";

/**
 * Estados en los que la CI ya no recibe a nadie. `esperando` y `aceptada` NO
 * existen en la instancia (son los pasos previos al pago del B2C: acá la CI
 * nace asignada), pero si aparecieran serían exactamente esto — un link que
 * no lleva a ningún lado.
 */
export const ESTADOS_CI_MUERTOS = new Set([
  "cancelada",
  "rechazada",
  "esperando",
  "aceptada",
]);

/** Terminales "el encuentro ya pasó", cada uno con su pantalla y su copy. */
const TERMINADOS: Record<string, PantallaConsulta> = {
  completada: "terminado",
  medico_ausente: "ausente-profesional",
  no_show_paciente: "ausente-paciente",
};

/**
 * ¿Qué pantalla le toca?
 *
 * `salaVideoUrl` es la señal de que EL PROFESIONAL ABRIÓ LA SALA — se escribe
 * en exactamente dos lugares y los dos exigen que él actúe. El estado no
 * sirve para eso: una CI puede estar `en_curso` sin que el profesional haya
 * entrado (lo escribe el webhook de pago en el B2C), lección ya escrita en
 * `resolver-vencidas.ts`. Mandar al paciente al video antes de que haya sala
 * lo deja mirando una pantalla negra.
 *
 * `yaEntro` lo trae el llamador (¿hay fila en la sala de espera?): sin él, un
 * paciente que refresca la pantalla vuelve a ver el botón "Entrar" como si no
 * hubiera hecho nada.
 */
export function pantallaDeLaConsulta(params: {
  estado: string;
  salaVideoUrl: string | null;
  yaEntro?: boolean;
}): PantallaConsulta {
  const { estado, salaVideoUrl } = params;

  if (ESTADOS_CI_MUERTOS.has(estado)) return "inactivo";
  if (TERMINADOS[estado]) return TERMINADOS[estado];

  if (estado === "pagada" || estado === "en_curso") {
    if (salaVideoUrl) return "sala";
    return params.yaEntro ? "espera" : "ventana";
  }

  // Estado desconocido: fail-safe, no adivinanza (mismo criterio que el turno).
  return "inactivo";
}
